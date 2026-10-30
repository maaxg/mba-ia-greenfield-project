import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { VideoUploadExpiredException } from '../common/exceptions/domain.exception';
import storageConfig from '../config/storage.config';
import { StorageService } from './storage.service';

const FIVE_MIB = 5 * 1024 * 1024;

describe('StorageService (integration)', () => {
  let service: StorageService;

  const newKey = () => `test/${randomUUID()}/original.mp4`;

  const putPart = async (
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ) => {
    const url = await service.presignUploadPart(key, uploadId, partNumber);
    const res = await fetch(url, { method: 'PUT', body: new Uint8Array(body) });
    expect(res.status).toBe(200);
    return res.headers.get('etag') as string;
  };

  const uploadObject = async (key: string, body: Buffer) => {
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');
    const etag = await putPart(key, uploadId, 1, body);
    await service.completeMultipartUpload(key, uploadId, [
      { part_number: 1, etag },
    ]);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
      ],
      providers: [StorageService],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  it('should assemble an object from parts uploaded with presigned URLs', async () => {
    const key = newKey();
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');

    const first = randomBytes(FIVE_MIB);
    const last = randomBytes(1024);
    const etag1 = await putPart(key, uploadId, 1, first);
    const etag2 = await putPart(key, uploadId, 2, last);

    await service.completeMultipartUpload(key, uploadId, [
      { part_number: 1, etag: etag1 },
      { part_number: 2, etag: etag2 },
    ]);

    const url = await service.presignGetObject(key);
    const res = await fetch(url);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(FIVE_MIB + 1024);
    expect(res.headers.get('content-type')).toBe('video/mp4');
  });

  it('should list uploaded parts so an upload can resume', async () => {
    const key = newKey();
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');
    const etag = await putPart(key, uploadId, 2, randomBytes(FIVE_MIB));

    await expect(service.listParts(key, uploadId)).resolves.toEqual([
      { part_number: 2, etag, size_bytes: FIVE_MIB },
    ]);
  });

  it('should answer a Range request on a signed URL with 206', async () => {
    const key = newKey();
    await uploadObject(key, randomBytes(2048));

    const res = await fetch(await service.presignGetObject(key), {
      headers: { Range: 'bytes=0-9' },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-9/2048');
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it('should sign a download URL with an attachment disposition', async () => {
    const key = newKey();
    await uploadObject(key, randomBytes(16));

    const url = await service.presignGetObject(key, {
      downloadFilename: 'clip.mp4',
    });
    const res = await fetch(url);

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="clip.mp4"',
    );
  });

  it('should reach the object through the internal signed URL', async () => {
    const key = newKey();
    await service.putObject(key, Buffer.from('thumb'), 'image/jpeg');

    const res = await fetch(await service.presignInternalGetObject(key));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('thumb');
  });

  it('should report an aborted upload as expired', async () => {
    const key = newKey();
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');
    await service.abortMultipartUpload(key, uploadId);

    await expect(service.listParts(key, uploadId)).rejects.toThrow(
      VideoUploadExpiredException,
    );
  });

  it('should report completion of an unknown upload as expired', async () => {
    await expect(
      service.completeMultipartUpload(newKey(), 'unknown-upload', [
        { part_number: 1, etag: '"abc"' },
      ]),
    ).rejects.toThrow(VideoUploadExpiredException);
  });
});
