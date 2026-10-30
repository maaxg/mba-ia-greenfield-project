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
import { createVideoFixture } from '../src/test/video-fixture';
import { User } from '../src/users/entities/user.entity';
import { VideoStatus } from '../src/videos/videos.constants';

const POLL_INTERVAL_MS = 200;

export const WORKER_TIMEOUT_MS = 30_000;
export const WORKER_TEST_TIMEOUT_MS = WORKER_TIMEOUT_MS + 5000;

// Registers the app lifecycle hooks on the calling describe block.
export function setupVideosE2e() {
  let app: INestApplication<App>;
  let throttlerStorage: ThrottlerStorageService;

  const http = () => request(app.getHttpServer());

  const createUser = async (): Promise<string> => {
    const email = `${randomUUID()}@example.com`;
    const password = 'password123';
    await http().post('/auth/register').send({ email, password }).expect(201);
    await context.dataSource
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
      .auth(context.token, { type: 'bearer' })
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
      .auth(context.token, { type: 'bearer' })
      .send({ part_numbers: [1] })
      .expect(200);
    const res = await fetch(signed.parts[0].url, {
      method: 'PUT',
      body: new Uint8Array(body),
    });
    expect(res.status).toBe(200);
    return [{ part_number: 1, etag: res.headers.get('etag') }];
  };

  const uploadAndComplete = async (body: Buffer): Promise<string> => {
    const { slug } = await startUpload(body);
    const parts = await sendPart(slug, body);
    await http()
      .post(`/videos/${slug}/upload/complete`)
      .auth(context.token, { type: 'bearer' })
      .send({ parts })
      .expect(202);
    return slug;
  };

  const waitForStatus = async (slug: string, expected: VideoStatus) => {
    const deadline = Date.now() + WORKER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { body } = await http()
        .get(`/videos/${slug}/status`)
        .auth(context.token, { type: 'bearer' })
        .expect(200);
      if (body.status === expected) return body;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `Video ${slug} did not reach ${expected}; is the video-worker service running?`,
    );
  };

  const context = {
    dataSource: undefined as unknown as DataSource,
    fixture: Buffer.alloc(0) as Buffer,
    token: '',
    otherToken: '',
    http,
    startUpload,
    sendPart,
    uploadAndComplete,
    waitForStatus,
  };

  beforeAll(async () => {
    context.fixture = await createVideoFixture();

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

    context.dataSource = moduleFixture.get(DataSource);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  }, WORKER_TIMEOUT_MS);

  beforeEach(async () => {
    await cleanAllTables(context.dataSource);
    throttlerStorage.storage.clear();
    context.token = await createUser();
    context.otherToken = await createUser();
    throttlerStorage.storage.clear();
  });

  afterAll(async () => {
    await cleanAllTables(context.dataSource);
    await app.close();
  });

  return context;
}
