import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { VideoStatus } from '../videos.constants';
import { Video } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];
const TEN_GIB = 10737418240;

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let videos: Repository<Video>;
  let channel: Channel;

  const buildVideo = (overrides: Partial<Video> = {}) =>
    videos.create({
      channel_id: channel.id,
      slug: randomUUID().slice(0, 11),
      title: 'Clip',
      storage_key: 'videos/clip/original.mp4',
      original_filename: 'clip.mp4',
      content_type: 'video/mp4',
      size_bytes: 1024,
      ...overrides,
    });

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    videos = dataSource.getRepository(Video);
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

  afterAll(async () => {
    await cleanAllTables(dataSource);
    await dataSource.destroy();
  });

  it('should default a new video to draft', async () => {
    const saved = await videos.save(buildVideo());

    const found = await videos.findOneByOrFail({ id: saved.id });
    expect(found.status).toBe(VideoStatus.DRAFT);
    expect(found.thumbnail_key).toBeNull();
    expect(found.duration_seconds).toBeNull();
  });

  it('should reject a duplicated slug', async () => {
    await videos.save(buildVideo({ slug: 'abcdefghijk' }));

    await expect(
      videos.save(buildVideo({ slug: 'abcdefghijk' })),
    ).rejects.toThrow(QueryFailedError);
  });

  it('should reject an unknown channel', async () => {
    await expect(
      videos.save(buildVideo({ channel_id: randomUUID() })),
    ).rejects.toThrow(QueryFailedError);
  });

  it('should reject a status outside the enum', async () => {
    await expect(
      videos.save(buildVideo({ status: 'archived' as VideoStatus })),
    ).rejects.toThrow(QueryFailedError);
  });

  it('should reject a video without a title', async () => {
    await expect(
      videos.save(buildVideo({ title: null as unknown as string })),
    ).rejects.toThrow(QueryFailedError);
  });

  it('should read a 10 GiB size back as a number', async () => {
    const saved = await videos.save(buildVideo({ size_bytes: TEN_GIB }));

    const found = await videos.findOneByOrFail({ id: saved.id });
    expect(found.size_bytes).toBe(TEN_GIB);
  });

  it('should read the duration back as a number', async () => {
    const saved = await videos.save(buildVideo({ duration_seconds: 12.345 }));

    const found = await videos.findOneByOrFail({ id: saved.id });
    expect(found.duration_seconds).toBe(12.345);
  });

  it('should exclude upload_id from default queries', async () => {
    const saved = await videos.save(buildVideo({ upload_id: 'upload-1' }));

    const found = await videos.findOneByOrFail({ id: saved.id });
    expect(found.upload_id).toBeUndefined();
  });

  it('should reach the channel through the relation', async () => {
    const saved = await videos.save(buildVideo());

    const found = await dataSource.getRepository(Channel).findOneOrFail({
      where: { id: channel.id },
      relations: ['videos'],
    });
    expect(found.videos.map((video) => video.id)).toEqual([saved.id]);
  });
});
