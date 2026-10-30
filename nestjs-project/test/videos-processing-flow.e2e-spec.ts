import { FIXTURE_WIDTH } from '../src/test/video-fixture';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/videos.constants';
import { setupVideosE2e, WORKER_TEST_TIMEOUT_MS } from './videos-e2e.helper';

jest.setTimeout(WORKER_TEST_TIMEOUT_MS);

describe('Video processing flow with the real worker (e2e)', () => {
  const ctx = setupVideosE2e();

  const uploadInvalidFile = () =>
    ctx.uploadAndComplete(Buffer.from('not a video'));

  it('should take an uploaded video to ready', async () => {
    const slug = await ctx.uploadAndComplete(ctx.fixture);

    const status = await ctx.waitForStatus(slug, VideoStatus.READY);

    expect(status.has_thumbnail).toBe(true);
    expect(status.failure_reason).toBeNull();
  });

  it('should persist what the worker extracted', async () => {
    const slug = await ctx.uploadAndComplete(ctx.fixture);
    await ctx.waitForStatus(slug, VideoStatus.READY);

    const video = await ctx.dataSource
      .getRepository(Video)
      .findOneByOrFail({ slug });

    expect(video.status).toBe(VideoStatus.READY);
    expect(video.thumbnail_key).toBe(`videos/${video.id}/thumbnail.jpg`);
    expect(video.metadata?.width).toBe(FIXTURE_WIDTH);
  });

  it('should fail an invalid file without a thumbnail', async () => {
    const slug = await uploadInvalidFile();

    const status = await ctx.waitForStatus(slug, VideoStatus.FAILED);

    expect(status.has_thumbnail).toBe(false);
  });

  it('should report why the file failed to its owner', async () => {
    const slug = await uploadInvalidFile();

    const status = await ctx.waitForStatus(slug, VideoStatus.FAILED);

    expect(status.failure_reason).toBe('INVALID_VIDEO_FILE');
  });

  it('should hide a failed video from public routes', async () => {
    const slug = await uploadInvalidFile();
    await ctx.waitForStatus(slug, VideoStatus.FAILED);

    await ctx.http().get(`/videos/${slug}`).expect(404);
  });
});
