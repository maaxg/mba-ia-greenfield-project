import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  NoSuchUpload,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  VideoUploadExpiredException,
  VideoUploadIncompleteException,
} from '../common/exceptions/domain.exception';
import storageConfig from '../config/storage.config';
import {
  READ_URL_TTL_SECONDS,
  UPLOAD_PART_URL_TTL_SECONDS,
} from './storage.constants';
import type {
  CompletedPart,
  PresignReadOptions,
  UploadedPart,
} from './storage.types';

const REJECTED_PARTS_ERRORS = new Set([
  'EntityTooSmall',
  'InvalidPart',
  'InvalidPartOrder',
]);

@Injectable()
export class StorageService {
  private readonly internalClient: S3Client;
  private readonly signingClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.internalClient = this.createClient(config.endpoint);
    this.signingClient = this.createClient(config.publicEndpoint);
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const { UploadId } = await this.internalClient.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    return UploadId as string;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new UploadPartCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: UPLOAD_PART_URL_TTL_SECONDS },
    );
  }

  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;

    try {
      do {
        const page = await this.internalClient.send(
          new ListPartsCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: marker,
          }),
        );
        for (const part of page.Parts ?? []) {
          parts.push({
            part_number: part.PartNumber as number,
            etag: part.ETag as string,
            size_bytes: part.Size as number,
          });
        }
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
      } while (marker);
    } catch (err) {
      throw this.translateUploadError(err);
    }

    return parts;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    try {
      await this.internalClient.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map(({ part_number, etag }) => ({
              PartNumber: part_number,
              ETag: etag,
            })),
          },
        }),
      );
    } catch (err) {
      throw this.translateUploadError(err);
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.internalClient.send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      throw this.translateUploadError(err);
    }
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async presignGetObject(
    key: string,
    options: PresignReadOptions = {},
  ): Promise<string> {
    return this.presignRead(this.signingClient, key, options);
  }

  async presignInternalGetObject(key: string): Promise<string> {
    return this.presignRead(this.internalClient, key, {});
  }

  private async presignRead(
    client: S3Client,
    key: string,
    { contentType, downloadFilename }: PresignReadOptions,
  ): Promise<string> {
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: downloadFilename
          ? `attachment; filename="${downloadFilename}"`
          : undefined,
      }),
      { expiresIn: READ_URL_TTL_SECONDS },
    );
  }

  private createClient(endpoint: string): S3Client {
    return new S3Client({
      endpoint,
      region: this.config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      // Presigned part URLs must not require checksum headers from the client.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private translateUploadError(err: unknown): unknown {
    if (err instanceof NoSuchUpload) {
      return new VideoUploadExpiredException();
    }
    if (err instanceof Error && REJECTED_PARTS_ERRORS.has(err.name)) {
      return new VideoUploadIncompleteException();
    }
    return err;
  }
}
