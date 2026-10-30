import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/videos.constants';
import { setupVideosE2e } from './videos-e2e.helper';

describe('videos-upload-complete.e2e-spec', () => {
  const ctx = setupVideosE2e();

  it('should reject parts that do not cover the file', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);
    const parts = await ctx.sendPart(slug, ctx.fixture.subarray(0, 100));

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ parts })
      .expect(422);

    expect(body.error).toBe('VIDEO_UPLOAD_INCOMPLETE');
    const status = await ctx
      .http()
      .get(`/videos/${slug}/status`)
      .auth(ctx.token, { type: 'bearer' })
      .expect(200);
    expect(status.body.status).toBe('draft');
  });

  it('should validate the request body', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ parts: [{ part_number: 'one' }] })
      .expect(400);

    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('should deny another user', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(ctx.otherToken, { type: 'bearer' })
      .send({ parts: [{ part_number: 1, etag: '"a"' }] })
      .expect(403);

    expect(body.error).toBe('VIDEO_ACCESS_DENIED');
  });

  it('should require a token to complete', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .send({ parts: [{ part_number: 1, etag: '"a"' }] })
      .expect(401);
  });

  it('should reject an invalid token when completing', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .auth('invalid-token', { type: 'bearer' })
      .send({ parts: [{ part_number: 1, etag: '"a"' }] })
      .expect(401);
  });

  it('should refuse a second completion', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);
    const parts = await ctx.sendPart(slug, ctx.fixture);
    await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ parts })
      .expect(202);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ parts })
      .expect(409);

    expect(body.error).toBe('VIDEO_UPLOAD_CLOSED');
  });

  it('should cancel a draft', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .delete(`/videos/${slug}/upload`)
      .auth(ctx.token, { type: 'bearer' })
      .expect(204);

    await ctx
      .http()
      .get(`/videos/${slug}/status`)
      .auth(ctx.token, { type: 'bearer' })
      .expect(404);
  });

  it('should require a token to cancel', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx.http().delete(`/videos/${slug}/upload`).expect(401);
  });

  it('should reject an invalid token when cancelling', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .delete(`/videos/${slug}/upload`)
      .auth('invalid-token', { type: 'bearer' })
      .expect(401);
  });

  it('should deny another user the cancellation', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .delete(`/videos/${slug}/upload`)
      .auth(ctx.otherToken, { type: 'bearer' })
      .expect(403);

    expect(body.error).toBe('VIDEO_ACCESS_DENIED');
  });

  it('should refuse to cancel a video in processing', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);
    // No job is published, so the worker cannot move the status during the test.
    await ctx.dataSource
      .getRepository(Video)
      .update({ slug }, { status: VideoStatus.PROCESSING });

    const { body } = await ctx
      .http()
      .delete(`/videos/${slug}/upload`)
      .auth(ctx.token, { type: 'bearer' })
      .expect(409);

    expect(body.error).toBe('VIDEO_UPLOAD_CLOSED');
    const status = await ctx
      .http()
      .get(`/videos/${slug}/status`)
      .auth(ctx.token, { type: 'bearer' })
      .expect(200);
    expect(status.body.status).toBe('processing');
  });
});
