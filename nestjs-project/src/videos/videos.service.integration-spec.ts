import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { ChannelsService } from '../channels/channels.service';
import {
  VideoNotFoundException,
  VideoProcessingUnavailableException,
  VideoUploadClosedException,
  VideoUploadExpiredException,
  VideoUploadIncompleteException,
} from '../common/exceptions/domain.exception';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { removeVideosFromStorage } from '../test/storage-cleanup';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { generateSlug } from './slug.util';
import { VideoQueueService } from './video-queue.service';
import {
  SLUG_MAX_RETRIES,
  VIDEO_FAILURE_REASON,
  VIDEO_QUEUE,
  VideoStatus,
} from './videos.constants';
import { VideosService } from './videos.service';

jest.mock('./slug.util', () => {
  const actual =
    jest.requireActual<typeof import('./slug.util')>('./slug.util');
  return { ...actual, generateSlug: jest.fn(actual.generateSlug) };
});

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideosService (integration)', () => {
  let dataSource: DataSource;
  let service: VideosService;
  let storage: StorageService;
  let videoQueue: VideoQueueService;
  let videos: Repository<Video>;
  let queue: Queue;
  let userId: string;

  const validDto = {
    filename: 'clip.mp4',
    size_bytes: 1024,
    content_type: 'video/mp4',
  };

  const expireUpload = async (id: string) => {
    const video = await videos.findOneOrFail({
      where: { id },
      select: ['id', 'storage_key', 'upload_id'],
    });
    await storage.abortMultipartUpload(
      video.storage_key,
      video.upload_id as string,
    );
  };

  const uploadFile = async (slug: string, body: Uint8Array<ArrayBuffer>) => {
    const { parts } = await service.signUploadParts(userId, slug, [1]);
    const res = await fetch(parts[0].url, { method: 'PUT', body });
    return [{ part_number: 1, etag: res.headers.get('etag') as string }];
  };

  beforeAll(async () => {
    // A dedicated queue keeps these jobs away from the running video-worker.
    queue = new Queue(`${VIDEO_QUEUE.NAME}-integration`, {
      connection: {
        host: process.env.REDIS_HOST ?? 'redis',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, videoConfig],
        }),
        TypeOrmModule.forRoot({
          ...createTestDataSource(ALL_ENTITIES).options,
        }),
        TypeOrmModule.forFeature([Video]),
      ],
      providers: [
        VideosService,
        VideoQueueService,
        ChannelsService,
        StorageService,
        { provide: getQueueToken(VIDEO_QUEUE.NAME), useValue: queue },
      ],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(VideosService);
    storage = moduleRef.get(StorageService);
    videoQueue = moduleRef.get(VideoQueueService);
    videos = moduleRef.get(getRepositoryToken(Video));
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource.getRepository(User).save({
      email: `${randomUUID()}@example.com`,
      password: 'hash',
    });
    await dataSource.getRepository(Channel).save({
      name: 'channel',
      nickname: randomUUID().slice(0, 20),
      user_id: user.id,
    });
    userId = user.id;
  });

  afterEach(async () => {
    await removeVideosFromStorage(dataSource);
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await cleanAllTables(dataSource);
    await dataSource.destroy();
  });

  describe('initiateUpload', () => {
    it('should persist a draft bound to an open multipart upload', async () => {
      const result = await service.initiateUpload(userId, validDto);

      const saved = await videos.findOneOrFail({
        where: { id: result.id },
        select: ['id', 'status', 'slug', 'storage_key', 'upload_id'],
      });
      expect(saved.status).toBe(VideoStatus.DRAFT);
      expect(saved.slug).toBe(result.slug);
      await expect(
        storage.listParts(saved.storage_key, saved.upload_id as string),
      ).resolves.toEqual([]);
    });

    it('should leave no row behind when the storage fails', async () => {
      jest
        .spyOn(storage, 'createMultipartUpload')
        .mockRejectedValueOnce(new Error('storage down'));

      await expect(service.initiateUpload(userId, validDto)).rejects.toThrow(
        'storage down',
      );
      await expect(videos.count()).resolves.toBe(0);
    });

    it('should draw a new slug when the first one is taken', async () => {
      const first = await service.initiateUpload(userId, validDto);
      jest.mocked(generateSlug).mockReturnValueOnce(first.slug);

      const second = await service.initiateUpload(userId, validDto);

      expect(second.slug).not.toBe(first.slug);
      await expect(videos.count()).resolves.toBe(2);
    });

    it('should give up when every slug attempt collides', async () => {
      const { slug } = await service.initiateUpload(userId, validDto);
      for (let attempt = 0; attempt <= SLUG_MAX_RETRIES; attempt++) {
        jest.mocked(generateSlug).mockReturnValueOnce(slug);
      }

      await expect(service.initiateUpload(userId, validDto)).rejects.toThrow(
        QueryFailedError,
      );
      await expect(videos.count()).resolves.toBe(1);
    });
  });

  describe('upload parts', () => {
    it('should list a part sent through a signed URL', async () => {
      const { slug } = await service.initiateUpload(userId, validDto);
      const { parts } = await service.signUploadParts(userId, slug, [1]);

      const res = await fetch(parts[0].url, {
        method: 'PUT',
        body: new Uint8Array(1024),
      });

      await expect(service.listUploadedParts(userId, slug)).resolves.toEqual([
        {
          part_number: 1,
          etag: res.headers.get('etag'),
          size_bytes: 1024,
        },
      ]);
    });
  });

  describe('completeUpload', () => {
    it('should assemble the file and publish the job', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      const parts = await uploadFile(slug, new Uint8Array(1024));

      const result = await service.completeUpload(userId, slug, parts);

      expect(result.status).toBe(VideoStatus.PROCESSING);
      const saved = await videos.findOneOrFail({
        where: { id },
        select: ['id', 'status', 'upload_id', 'storage_key'],
      });
      expect(saved.status).toBe(VideoStatus.PROCESSING);
      expect(saved.upload_id).toBeNull();
      const res = await fetch(
        await storage.presignGetObject(saved.storage_key),
      );
      expect((await res.arrayBuffer()).byteLength).toBe(1024);
      const job = await queue.getJob(id);
      expect(job?.name).toBe(VIDEO_QUEUE.JOB_PROCESS);
      expect(job?.data).toEqual({ videoId: id });
      expect(job?.opts.attempts).toBe(3);
    });

    it('should keep the video in draft when bytes are missing', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      const parts = await uploadFile(slug, new Uint8Array(10));

      await expect(service.completeUpload(userId, slug, parts)).rejects.toThrow(
        VideoUploadIncompleteException,
      );
      const saved = await videos.findOneByOrFail({ id });
      expect(saved.status).toBe(VideoStatus.DRAFT);
    });

    it('should accept only one of two concurrent completions', async () => {
      const { slug } = await service.initiateUpload(userId, validDto);
      const parts = await uploadFile(slug, new Uint8Array(1024));

      const results = await Promise.allSettled([
        service.completeUpload(userId, slug, parts),
        service.completeUpload(userId, slug, parts),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(VideoUploadClosedException);
    });

    it('should return the video to draft when the storage rejects it', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      const parts = await uploadFile(slug, new Uint8Array(1024));
      jest
        .spyOn(storage, 'completeMultipartUpload')
        .mockRejectedValueOnce(new Error('storage down'));

      await expect(service.completeUpload(userId, slug, parts)).rejects.toThrow(
        'storage down',
      );

      const saved = await videos.findOneByOrFail({ id });
      expect(saved.status).toBe(VideoStatus.DRAFT);
      const retry = await service.completeUpload(userId, slug, parts);
      expect(retry.status).toBe(VideoStatus.PROCESSING);
    });

    it('should mark the video as failed when the queue is unavailable', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      const parts = await uploadFile(slug, new Uint8Array(1024));
      jest
        .spyOn(videoQueue, 'enqueueProcessing')
        .mockRejectedValueOnce(new Error('redis down'));

      await expect(service.completeUpload(userId, slug, parts)).rejects.toThrow(
        VideoProcessingUnavailableException,
      );

      const saved = await videos.findOneByOrFail({ id });
      expect(saved.status).toBe(VideoStatus.FAILED);
      expect(saved.failure_reason).toBe(VIDEO_FAILURE_REASON.ENQUEUE_FAILED);
    });

    it('should report an upload the storage no longer has as expired', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      await expireUpload(id);

      await expect(
        service.completeUpload(userId, slug, [
          { part_number: 1, etag: '"abc"' },
        ]),
      ).rejects.toThrow(VideoUploadExpiredException);

      const saved = await videos.findOneByOrFail({ id });
      expect(saved.status).toBe(VideoStatus.DRAFT);
    });
  });

  describe('cancelUpload', () => {
    it('should remove the draft and close the storage upload', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);

      await service.cancelUpload(userId, slug);

      await expect(videos.countBy({ id })).resolves.toBe(0);
      await expect(service.cancelUpload(userId, slug)).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('should remove the draft of an upload that already expired', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      await expireUpload(id);

      await service.cancelUpload(userId, slug);

      await expect(videos.countBy({ id })).resolves.toBe(0);
    });
  });

  describe('reading a ready video', () => {
    it('should sign a stream URL that honors Range', async () => {
      const { id, slug } = await service.initiateUpload(userId, validDto);
      const parts = await uploadFile(slug, new Uint8Array(1024));
      await service.completeUpload(userId, slug, parts);
      await videos.update(id, { status: VideoStatus.READY });

      const res = await fetch(await service.getStreamUrl(slug), {
        headers: { Range: 'bytes=0-99' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-type')).toBe('video/mp4');
    });

    it('should not stream a video that is not ready', async () => {
      const { slug } = await service.initiateUpload(userId, validDto);

      await expect(service.getStreamUrl(slug)).rejects.toThrow(
        VideoNotFoundException,
      );
    });
  });
});
