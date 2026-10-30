import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { removeVideosFromStorage } from '../test/storage-cleanup';
import {
  createVideoFixture,
  FIXTURE_DURATION_SECONDS,
} from '../test/video-fixture';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { VIDEO_FAILURE_REASON, VideoStatus } from '../videos/videos.constants';
import { FfmpegService } from './ffmpeg.service';
import { VideoProcessingService } from './video-processing.service';
import { InvalidVideoFileError } from './video-worker.errors';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideoProcessingService (integration)', () => {
  let dataSource: DataSource;
  let service: VideoProcessingService;
  let storage: StorageService;
  let videos: Repository<Video>;
  let channel: Channel;
  let fixture: Buffer;

  const createVideo = async (
    body: Buffer | null,
    status = VideoStatus.PROCESSING,
  ) => {
    const id = randomUUID();
    const storage_key = `videos/${id}/original.mp4`;
    if (body) {
      await storage.putObject(storage_key, body, 'video/mp4');
    }
    return videos.save(
      videos.create({
        id,
        channel_id: channel.id,
        slug: id.slice(0, 11),
        title: 'Clip',
        status,
        storage_key,
        original_filename: 'clip.mp4',
        content_type: 'video/mp4',
        size_bytes: body?.length ?? 1,
      }),
    );
  };

  beforeAll(async () => {
    fixture = await createVideoFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
        TypeOrmModule.forRoot({
          ...createTestDataSource(ALL_ENTITIES).options,
        }),
        TypeOrmModule.forFeature([Video]),
      ],
      providers: [VideoProcessingService, FfmpegService, StorageService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(VideoProcessingService);
    storage = moduleRef.get(StorageService);
    videos = moduleRef.get(getRepositoryToken(Video));
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource.getRepository(User).save({
      email: `${randomUUID()}@example.com`,
      password: 'hash',
    });
    channel = await dataSource.getRepository(Channel).save({
      name: 'channel',
      nickname: randomUUID().slice(0, 20),
      user_id: user.id,
    });
  });

  afterEach(async () => {
    await removeVideosFromStorage(dataSource);
  });

  afterAll(async () => {
    await cleanAllTables(dataSource);
    await dataSource.destroy();
  });

  it('should store metadata and a thumbnail, then mark the video ready', async () => {
    const video = await createVideo(fixture);

    await service.process(video.id);

    const saved = await videos.findOneByOrFail({ id: video.id });
    expect(saved.status).toBe(VideoStatus.READY);
    expect(saved.duration_seconds).toBeCloseTo(FIXTURE_DURATION_SECONDS, 0);
    expect(saved.metadata?.video_codec).toBe('h264');
    expect(saved.thumbnail_key).toBe(`videos/${video.id}/thumbnail.jpg`);

    const res = await fetch(
      await storage.presignGetObject(saved.thumbnail_key as string),
    );
    const thumbnail = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(thumbnail.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('should reject a file that is not a video', async () => {
    const video = await createVideo(Buffer.from('this is not a video'));

    await expect(service.process(video.id)).rejects.toThrow(
      InvalidVideoFileError,
    );
  });

  it('should surface a missing object as a retryable failure', async () => {
    const video = await createVideo(null);

    const processing = service.process(video.id);

    await expect(processing).rejects.toBeInstanceOf(Error);
    await expect(processing).rejects.not.toBeInstanceOf(InvalidVideoFileError);
  });

  it('should leave a ready video untouched on redelivery', async () => {
    const video = await createVideo(fixture);
    await service.process(video.id);
    const first = await videos.findOneByOrFail({ id: video.id });

    await service.process(video.id);

    const second = await videos.findOneByOrFail({ id: video.id });
    expect(second.updated_at).toEqual(first.updated_at);
  });

  it('should ignore an unknown video', async () => {
    await expect(service.process(randomUUID())).resolves.toBeUndefined();
  });

  it('should record the failure reason of a video in processing', async () => {
    const video = await createVideo(fixture);

    await service.markFailed(video.id, VIDEO_FAILURE_REASON.PROCESSING_ERROR);

    const saved = await videos.findOneByOrFail({ id: video.id });
    expect(saved.status).toBe(VideoStatus.FAILED);
    expect(saved.failure_reason).toBe('PROCESSING_ERROR');
  });

  it('should not fail a video that already finished', async () => {
    const video = await createVideo(fixture, VideoStatus.READY);

    await service.markFailed(video.id, VIDEO_FAILURE_REASON.PROCESSING_ERROR);

    const saved = await videos.findOneByOrFail({ id: video.id });
    expect(saved.status).toBe(VideoStatus.READY);
  });
});
