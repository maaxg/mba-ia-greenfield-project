import { FIXTURE_DURATION_SECONDS } from '../src/test/video-fixture';
import { VideoStatus } from '../src/videos/videos.constants';
import { setupVideosE2e, WORKER_TEST_TIMEOUT_MS } from './videos-e2e.helper';

jest.setTimeout(WORKER_TEST_TIMEOUT_MS);

describe('videos-stream.e2e-spec', () => {
  const ctx = setupVideosE2e();

  const uploadReadyVideo = async (): Promise<string> => {
    const slug = await ctx.uploadAndComplete(ctx.fixture);
    await ctx.waitForStatus(slug, VideoStatus.READY);
    return slug;
  };

  it('should serve the video anonymously at its unique URL', async () => {
    const slug = await uploadReadyVideo();

    const { body } = await ctx.http().get(`/videos/${slug}`).expect(200);

    expect(body.status).toBe('ready');
    expect(body.duration_seconds).toBeCloseTo(FIXTURE_DURATION_SECONDS, 0);
    expect(body.metadata.video_codec).toBe('h264');
    expect(body).not.toHaveProperty('storage_key');
    expect(body).not.toHaveProperty('thumbnail_key');
    expect(body).not.toHaveProperty('upload_id');
    expect(body).not.toHaveProperty('channel');
  });

  it('should serve the generated thumbnail', async () => {
    const slug = await uploadReadyVideo();

    const { headers } = await ctx
      .http()
      .get(`/videos/${slug}/thumbnail`)
      .expect(302);

    const res = await fetch(headers.location);
    const thumbnail = Buffer.from(await res.arrayBuffer());

    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(thumbnail.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('should stream partial content through the redirect', async () => {
    const slug = await uploadReadyVideo();

    const { headers } = await ctx
      .http()
      .get(`/videos/${slug}/stream`)
      .expect(302);

    const res = await fetch(headers.location, {
      headers: { Range: 'bytes=0-1023' },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 0-1023/${ctx.fixture.length}`,
    );
    expect(res.headers.get('content-type')).toBe('video/mp4');
  });

  it('should download the file as an attachment', async () => {
    const slug = await uploadReadyVideo();

    const { headers } = await ctx
      .http()
      .get(`/videos/${slug}/download`)
      .expect(302);

    const res = await fetch(headers.location);

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="clip.mp4"',
    );
    expect((await res.arrayBuffer()).byteLength).toBe(ctx.fixture.length);
  });

  it('should hide a video that is not ready from public routes', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx.http().get(`/videos/${slug}`).expect(404);

    expect(body.error).toBe('VIDEO_NOT_FOUND');
    await ctx.http().get(`/videos/${slug}/stream`).expect(404);
    await ctx.http().get(`/videos/${slug}/download`).expect(404);
    await ctx.http().get(`/videos/${slug}/thumbnail`).expect(404);
  });

  it('should require the owner on the status route', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx.http().get(`/videos/${slug}/status`).expect(401);
    await ctx
      .http()
      .get(`/videos/${slug}/status`)
      .auth(ctx.otherToken, { type: 'bearer' })
      .expect(403);
  });

  it('should reject an invalid token on the status route', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .get(`/videos/${slug}/status`)
      .auth('invalid-token', { type: 'bearer' })
      .expect(401);
  });
});
