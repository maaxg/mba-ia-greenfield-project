import { setupVideosE2e } from './videos-e2e.helper';

const TEN_GIB = 10737418240;

describe('videos.e2e-spec', () => {
  const ctx = setupVideosE2e();

  const validBody = {
    filename: 'clip.mp4',
    size_bytes: 100 * 1024 * 1024,
    content_type: 'video/mp4',
  };

  it('should register a draft with a unique slug', async () => {
    const { body } = await ctx
      .http()
      .post('/videos')
      .auth(ctx.token, { type: 'bearer' })
      .send(validBody)
      .expect(201);

    expect(body.slug).toMatch(/^[0-9A-Za-z]{11}$/);
    expect(body.status).toBe('draft');
    expect(body.part_size_bytes).toBe(67108864);
    expect(body.part_count).toBe(2);
  });

  it('should accept the 10 GiB limit without receiving any byte', async () => {
    const { body } = await ctx
      .http()
      .post('/videos')
      .auth(ctx.token, { type: 'bearer' })
      .send({ ...validBody, size_bytes: TEN_GIB })
      .expect(201);

    expect(body.part_count).toBe(160);
  });

  it('should require authentication', async () => {
    await ctx.http().post('/videos').send(validBody).expect(401);
  });

  it('should reject a file above the limit', async () => {
    const { body } = await ctx
      .http()
      .post('/videos')
      .auth(ctx.token, { type: 'bearer' })
      .send({ ...validBody, size_bytes: TEN_GIB + 1 })
      .expect(413);

    expect(body.error).toBe('VIDEO_TOO_LARGE');
  });

  it('should reject a file that is not a video', async () => {
    const { body } = await ctx
      .http()
      .post('/videos')
      .auth(ctx.token, { type: 'bearer' })
      .send({ ...validBody, content_type: 'text/plain' })
      .expect(415);

    expect(body.error).toBe('UNSUPPORTED_VIDEO_TYPE');
  });

  it('should validate the request body', async () => {
    const { body } = await ctx
      .http()
      .post('/videos')
      .auth(ctx.token, { type: 'bearer' })
      .send({ filename: 'clip.mp4' })
      .expect(400);

    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('should generate different slugs for different videos', async () => {
    const first = await ctx.startUpload(ctx.fixture);
    const second = await ctx.startUpload(ctx.fixture);

    expect(first.slug).not.toBe(second.slug);
  });
});
