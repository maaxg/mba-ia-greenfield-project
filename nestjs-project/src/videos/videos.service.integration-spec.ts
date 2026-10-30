import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { VideoStatus } from './videos.constants';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideosService (integration)', () => {
  let dataSource: DataSource;
  let service: VideosService;
  let storage: StorageService;
  let videos: Repository<Video>;
  let userId: string;

  const validDto = {
    filename: 'clip.mp4',
    size_bytes: 1024,
    content_type: 'video/mp4',
  };

  beforeAll(async () => {
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
      providers: [VideosService, ChannelsService, StorageService],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(VideosService);
    storage = moduleRef.get(StorageService);
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

  afterAll(async () => {
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
});
