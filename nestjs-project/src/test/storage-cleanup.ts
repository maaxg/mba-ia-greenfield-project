import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  NoSuchUpload,
  S3Client,
} from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';
import { Video } from '../videos/entities/video.entity';

export type OpenUpload = { key: string; uploadId: string };

const bucket = () => process.env.S3_BUCKET ?? 'streamtube-videos';

const createClient = () =>
  new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://minio:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'streamtube',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'streamtube-secret',
    },
  });

// Takes exact keys on purpose: tests share the bucket with development data.
export async function removeFromStorage(
  keys: string[],
  uploads: OpenUpload[] = [],
): Promise<void> {
  const client = createClient();

  for (const { key, uploadId } of uploads) {
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket(),
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      if (!(err instanceof NoSuchUpload)) {
        throw err;
      }
    }
  }
  for (const key of keys) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  }

  client.destroy();
}

// Call from afterEach: the rows found there were created by the test that just ran.
export async function removeVideosFromStorage(
  dataSource: DataSource,
): Promise<void> {
  const videos = await dataSource
    .getRepository(Video)
    .createQueryBuilder('video')
    .addSelect('video.upload_id')
    .getMany();

  await removeFromStorage(
    videos.flatMap(({ storage_key, thumbnail_key }) =>
      thumbnail_key ? [storage_key, thumbnail_key] : [storage_key],
    ),
    videos.flatMap(({ storage_key, upload_id }) =>
      upload_id ? [{ key: storage_key, uploadId: upload_id }] : [],
    ),
  );
}
