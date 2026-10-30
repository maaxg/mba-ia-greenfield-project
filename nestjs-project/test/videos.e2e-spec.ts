import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import {
  createVideoFixture,
  FIXTURE_DURATION_SECONDS,
  FIXTURE_WIDTH,
} from '../src/test/video-fixture';
import { User } from '../src/users/entities/user.entity';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/videos.constants';

const WORKER_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;
const TEN_GIB = 10737418240;

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let throttlerStorage: ThrottlerStorageService;
  let fixture: Buffer;
  let token: string;
  let otherToken: string;

  const http = () => request(app.getHttpServer());

  const createUser = async (): Promise<string> => {
    const email = `${randomUUID()}@example.com`;
    const password = 'password123';
    await http().post('/auth/register').send({ email, password }).expect(201);
    await dataSource
      .getRepository(User)
      .update({ email }, { is_confirmed: true });
    const { body } = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return body.access_token;
  };

  const startUpload = async (body: Buffer) => {
    const res = await http()
      .post('/videos')
      .auth(token, { type: 'bearer' })
      .send({
        filename: 'clip.mp4',
        size_bytes: body.length,
        content_type: 'video/mp4',
      })
      .expect(201);
    return res.body;
  };

  const sendPart = async (slug: string, body: Buffer) => {
    const { body: signed } = await http()
      .post(`/videos/${slug}/upload/parts`)
      .auth(token, { type: 'bearer' })
      .send({ part_numbers: [1] })
      .expect(200);
    const res = await fetch(signed.parts[0].url, {
      method: 'PUT',
      body: new Uint8Array(body),
    });
    expect(res.status).toBe(200);
    return [{ part_number: 1, etag: res.headers.get('etag') }];
  };

  const uploadAndComplete = async (body: Buffer) => {
    const { slug } = await startUpload(body);
    const parts = await sendPart(slug, body);
    await http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(token, { type: 'bearer' })
      .send({ parts })
      .expect(202);
    return slug as string;
  };

  const waitForStatus = async (slug: string, expected: VideoStatus) => {
    const deadline = Date.now() + WORKER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { body } = await http()
        .get(`/videos/${slug}/status`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      if (body.status === expected) return body;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `Video ${slug} did not reach ${expected}; is the video-worker service running?`,
    );
  };

  beforeAll(async () => {
    fixture = await createVideoFixture();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
    token = await createUser();
    otherToken = await createUser();
    throttlerStorage.storage.clear();
  });

  afterAll(async () => {
    await cleanAllTables(dataSource);
    await app.close();
  });

  describe('POST /videos', () => {
    const validBody = {
      filename: 'clip.mp4',
      size_bytes: 100 * 1024 * 1024,
      content_type: 'video/mp4',
    };

    it('should register a draft with a unique slug', async () => {
      const { body } = await http()
        .post('/videos')
        .auth(token, { type: 'bearer' })
        .send(validBody)
        .expect(201);

      expect(body.slug).toMatch(/^[0-9A-Za-z]{11}$/);
      expect(body.status).toBe('draft');
      expect(body.part_size_bytes).toBe(67108864);
      expect(body.part_count).toBe(2);
    });

    it('should accept the 10 GiB limit without receiving any byte', async () => {
      const { body } = await http()
        .post('/videos')
        .auth(token, { type: 'bearer' })
        .send({ ...validBody, size_bytes: TEN_GIB })
        .expect(201);

      expect(body.part_count).toBe(160);
    });

    it('should require authentication', async () => {
      await http().post('/videos').send(validBody).expect(401);
    });

    it('should reject a file above the limit', async () => {
      const { body } = await http()
        .post('/videos')
        .auth(token, { type: 'bearer' })
        .send({ ...validBody, size_bytes: TEN_GIB + 1 })
        .expect(413);

      expect(body.error).toBe('VIDEO_TOO_LARGE');
    });

    it('should reject a file that is not a video', async () => {
      const { body } = await http()
        .post('/videos')
        .auth(token, { type: 'bearer' })
        .send({ ...validBody, content_type: 'text/plain' })
        .expect(415);

      expect(body.error).toBe('UNSUPPORTED_VIDEO_TYPE');
    });

    it('should validate the request body', async () => {
      const { body } = await http()
        .post('/videos')
        .auth(token, { type: 'bearer' })
        .send({ filename: 'clip.mp4' })
        .expect(400);

      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should generate different slugs for different videos', async () => {
      const first = await startUpload(fixture);
      const second = await startUpload(fixture);

      expect(first.slug).not.toBe(second.slug);
    });
  });

  describe('/videos/:slug/upload/parts', () => {
    it('should sign a URL per part', async () => {
      const { slug } = await startUpload(fixture);

      const { body } = await http()
        .post(`/videos/${slug}/upload/parts`)
        .auth(token, { type: 'bearer' })
        .send({ part_numbers: [1] })
        .expect(200);

      expect(body.parts).toHaveLength(1);
      expect(body.expires_in).toBe(3600);
    });

    it('should reject a part out of range', async () => {
      const { slug } = await startUpload(fixture);

      const { body } = await http()
        .post(`/videos/${slug}/upload/parts`)
        .auth(token, { type: 'bearer' })
        .send({ part_numbers: [999] })
        .expect(400);

      expect(body.error).toBe('VIDEO_PART_OUT_OF_RANGE');
    });

    it('should deny another user', async () => {
      const { slug } = await startUpload(fixture);

      const { body } = await http()
        .post(`/videos/${slug}/upload/parts`)
        .auth(otherToken, { type: 'bearer' })
        .send({ part_numbers: [1] })
        .expect(403);

      expect(body.error).toBe('VIDEO_ACCESS_DENIED');
    });

    it('should report an unknown video', async () => {
      const { body } = await http()
        .post('/videos/unknownslug/upload/parts')
        .auth(token, { type: 'bearer' })
        .send({ part_numbers: [1] })
        .expect(404);

      expect(body.error).toBe('VIDEO_NOT_FOUND');
    });

    it('should validate the request body', async () => {
      const { slug } = await startUpload(fixture);

      const { body } = await http()
        .post(`/videos/${slug}/upload/parts`)
        .auth(token, { type: 'bearer' })
        .send({ part_numbers: [] })
        .expect(400);

      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should list uploaded parts so a client can resume', async () => {
      const { slug } = await startUpload(fixture);
      const [part] = await sendPart(slug, fixture);

      const { body } = await http()
        .get(`/videos/${slug}/upload/parts`)
        .auth(token, { type: 'bearer' })
        .expect(200);

      expect(body.parts).toEqual([
        {
          part_number: 1,
          etag: part.etag,
          size_bytes: fixture.length,
        },
      ]);
    });

    it('should not rate limit part signing', async () => {
      const { slug } = await startUpload(fixture);

      for (let i = 0; i < 12; i++) {
        await http()
          .post(`/videos/${slug}/upload/parts`)
          .auth(token, { type: 'bearer' })
          .send({ part_numbers: [1] })
          .expect(200);
      }
    });
  });

  describe('POST /videos/:slug/upload/complete', () => {
    it('should reject parts that do not cover the file', async () => {
      const { slug } = await startUpload(fixture);
      const parts = await sendPart(slug, fixture.subarray(0, 100));

      const { body } = await http()
        .post(`/videos/${slug}/upload/complete`)
        .auth(token, { type: 'bearer' })
        .send({ parts })
        .expect(422);

      expect(body.error).toBe('VIDEO_UPLOAD_INCOMPLETE');
      const status = await http()
        .get(`/videos/${slug}/status`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(status.body.status).toBe('draft');
    });

    it('should validate the request body', async () => {
      const { slug } = await startUpload(fixture);

      const { body } = await http()
        .post(`/videos/${slug}/upload/complete`)
        .auth(token, { type: 'bearer' })
        .send({ parts: [{ part_number: 'one' }] })
        .expect(400);

      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should deny another user', async () => {
      const { slug } = await startUpload(fixture);

      await http()
        .post(`/videos/${slug}/upload/complete`)
        .auth(otherToken, { type: 'bearer' })
        .send({ parts: [{ part_number: 1, etag: '"a"' }] })
        .expect(403);
    });

    it('should refuse a second completion', async () => {
      const { slug } = await startUpload(fixture);
      const parts = await sendPart(slug, fixture);
      await http()
        .post(`/videos/${slug}/upload/complete`)
        .auth(token, { type: 'bearer' })
        .send({ parts })
        .expect(202);

      const { body } = await http()
        .post(`/videos/${slug}/upload/complete`)
        .auth(token, { type: 'bearer' })
        .send({ parts })
        .expect(409);

      expect(body.error).toBe('VIDEO_UPLOAD_CLOSED');
    });
  });

  describe('DELETE /videos/:slug/upload', () => {
    it('should cancel a draft', async () => {
      const { slug } = await startUpload(fixture);

      await http()
        .delete(`/videos/${slug}/upload`)
        .auth(token, { type: 'bearer' })
        .expect(204);

      await http()
        .get(`/videos/${slug}/status`)
        .auth(token, { type: 'bearer' })
        .expect(404);
    });

    it('should refuse to cancel a closed upload', async () => {
      const slug = await uploadAndComplete(fixture);

      const { body } = await http()
        .delete(`/videos/${slug}/upload`)
        .auth(token, { type: 'bearer' })
        .expect(409);

      expect(body.error).toBe('VIDEO_UPLOAD_CLOSED');
    });
  });

  describe('complete flow with the real worker', () => {
    let slug: string;

    beforeEach(async () => {
      slug = await uploadAndComplete(fixture);
      await waitForStatus(slug, VideoStatus.READY);
    }, WORKER_TIMEOUT_MS + 5000);

    it('should persist what the worker extracted', async () => {
      const video = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ slug });

      expect(video.status).toBe(VideoStatus.READY);
      expect(video.thumbnail_key).toBe(`videos/${video.id}/thumbnail.jpg`);
      expect(video.metadata?.width).toBe(FIXTURE_WIDTH);
    });

    it('should serve the video anonymously at its unique URL', async () => {
      const { body } = await http().get(`/videos/${slug}`).expect(200);

      expect(body.status).toBe('ready');
      expect(body.duration_seconds).toBeCloseTo(FIXTURE_DURATION_SECONDS, 0);
      expect(body.metadata.video_codec).toBe('h264');
      expect(body).not.toHaveProperty('storage_key');
      expect(body).not.toHaveProperty('channel');
    });

    it('should stream partial content through the redirect', async () => {
      const { headers } = await http()
        .get(`/videos/${slug}/stream`)
        .expect(302);

      const res = await fetch(headers.location, {
        headers: { Range: 'bytes=0-1023' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe(
        `bytes 0-1023/${fixture.length}`,
      );
      expect(res.headers.get('content-type')).toBe('video/mp4');
    });

    it('should download the file as an attachment', async () => {
      const { headers } = await http()
        .get(`/videos/${slug}/download`)
        .expect(302);

      const res = await fetch(headers.location);

      expect(res.headers.get('content-disposition')).toBe(
        'attachment; filename="clip.mp4"',
      );
      expect((await res.arrayBuffer()).byteLength).toBe(fixture.length);
    });

    it('should serve the generated thumbnail', async () => {
      const { headers } = await http()
        .get(`/videos/${slug}/thumbnail`)
        .expect(302);

      const res = await fetch(headers.location);
      const thumbnail = Buffer.from(await res.arrayBuffer());

      expect(res.headers.get('content-type')).toBe('image/jpeg');
      expect(thumbnail.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    });
  });

  describe('videos that are not ready', () => {
    it('should hide a draft from public routes', async () => {
      const { slug } = await startUpload(fixture);

      const { body } = await http().get(`/videos/${slug}`).expect(404);

      expect(body.error).toBe('VIDEO_NOT_FOUND');
      await http().get(`/videos/${slug}/stream`).expect(404);
      await http().get(`/videos/${slug}/download`).expect(404);
      await http().get(`/videos/${slug}/thumbnail`).expect(404);
    });

    it('should require the owner on the status route', async () => {
      const { slug } = await startUpload(fixture);

      await http().get(`/videos/${slug}/status`).expect(401);
      await http()
        .get(`/videos/${slug}/status`)
        .auth(otherToken, { type: 'bearer' })
        .expect(403);
    });
  });

  describe('failed processing with the real worker', () => {
    it(
      'should fail an invalid file without retrying',
      async () => {
        const slug = await uploadAndComplete(Buffer.from('not a video'));

        const status = await waitForStatus(slug, VideoStatus.FAILED);

        expect(status.failure_reason).toBe('INVALID_VIDEO_FILE');
        expect(status.has_thumbnail).toBe(false);
        await http().get(`/videos/${slug}`).expect(404);
      },
      WORKER_TIMEOUT_MS + 5000,
    );
  });
});
