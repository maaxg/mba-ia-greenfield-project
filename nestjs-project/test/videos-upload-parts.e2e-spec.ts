import { setupVideosE2e } from './videos-e2e.helper';

describe('videos-upload-parts.e2e-spec', () => {
  const ctx = setupVideosE2e();

  it('should sign a URL per part', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/parts`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ part_numbers: [1] })
      .expect(200);

    expect(body.parts).toHaveLength(1);
    expect(body.expires_in).toBe(3600);
  });

  it('should reject a part out of range', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/parts`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ part_numbers: [999] })
      .expect(400);

    expect(body.error).toBe('VIDEO_PART_OUT_OF_RANGE');
  });

  it('should deny another user', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/parts`)
      .auth(ctx.otherToken, { type: 'bearer' })
      .send({ part_numbers: [1] })
      .expect(403);

    expect(body.error).toBe('VIDEO_ACCESS_DENIED');
  });

  it('should report an unknown video', async () => {
    const { body } = await ctx
      .http()
      .post('/videos/unknownslug/upload/parts')
      .auth(ctx.token, { type: 'bearer' })
      .send({ part_numbers: [1] })
      .expect(404);

    expect(body.error).toBe('VIDEO_NOT_FOUND');
  });

  it('should validate the request body', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .post(`/videos/${slug}/upload/parts`)
      .auth(ctx.token, { type: 'bearer' })
      .send({ part_numbers: [] })
      .expect(400);

    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('should list uploaded parts so a client can resume', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);
    const [part] = await ctx.sendPart(slug, ctx.fixture);

    const { body } = await ctx
      .http()
      .get(`/videos/${slug}/upload/parts`)
      .auth(ctx.token, { type: 'bearer' })
      .expect(200);

    expect(body.parts).toEqual([
      {
        part_number: 1,
        etag: part.etag,
        size_bytes: ctx.fixture.length,
      },
    ]);
  });

  it('should require a token to sign parts', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .post(`/videos/${slug}/upload/parts`)
      .send({ part_numbers: [1] })
      .expect(401);
  });

  it('should reject an invalid token when signing parts', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .post(`/videos/${slug}/upload/parts`)
      .auth('invalid-token', { type: 'bearer' })
      .send({ part_numbers: [1] })
      .expect(401);
  });

  it('should require a token to list parts', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx.http().get(`/videos/${slug}/upload/parts`).expect(401);
  });

  it('should reject an invalid token when listing parts', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    await ctx
      .http()
      .get(`/videos/${slug}/upload/parts`)
      .auth('invalid-token', { type: 'bearer' })
      .expect(401);
  });

  it('should deny another user the list of parts', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    const { body } = await ctx
      .http()
      .get(`/videos/${slug}/upload/parts`)
      .auth(ctx.otherToken, { type: 'bearer' })
      .expect(403);

    expect(body.error).toBe('VIDEO_ACCESS_DENIED');
  });

  it('should not rate limit part signing', async () => {
    const { slug } = await ctx.startUpload(ctx.fixture);

    for (let i = 0; i < 12; i++) {
      await ctx
        .http()
        .post(`/videos/${slug}/upload/parts`)
        .auth(ctx.token, { type: 'bearer' })
        .send({ part_numbers: [1] })
        .expect(200);
    }
  });
});
