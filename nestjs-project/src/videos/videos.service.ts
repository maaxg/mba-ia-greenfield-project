import { randomUUID } from 'node:crypto';
import { extname, parse } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import {
  ChannelNotFoundException,
  UnsupportedVideoTypeException,
  VideoAccessDeniedException,
  VideoNotFoundException,
  VideoPartOutOfRangeException,
  VideoTooLargeException,
  VideoUploadClosedException,
} from '../common/exceptions/domain.exception';
import videoConfig from '../config/video.config';
import { isPgUniqueViolationOnColumn } from '../database/pg-errors';
import { UPLOAD_PART_URL_TTL_SECONDS } from '../storage/storage.constants';
import { StorageService } from '../storage/storage.service';
import type { UploadedPart } from '../storage/storage.types';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { InitiateUploadResponseDto } from './dto/initiate-upload-response.dto';
import { SignUploadPartsResponseDto } from './dto/sign-upload-parts-response.dto';
import { Video } from './entities/video.entity';
import { generateSlug } from './slug.util';
import {
  MAX_PARTS_PER_UPLOAD,
  SLUG_MAX_RETRIES,
  VIDEO_CONTENT_TYPE_PREFIX,
  VideoStatus,
} from './videos.constants';

const SLUG_COLUMN = 'slug';
const SAFE_EXTENSION = /^\.[a-z0-9]{1,10}$/;

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
  ) {}

  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponseDto> {
    if (dto.size_bytes > this.config.maxSizeBytes) {
      throw new VideoTooLargeException();
    }
    if (!dto.content_type.startsWith(VIDEO_CONTENT_TYPE_PREFIX)) {
      throw new UnsupportedVideoTypeException();
    }

    const channel = await this.channelsService.findByUserId(userId);
    if (!channel) {
      throw new ChannelNotFoundException();
    }

    const video = await this.createDraft(channel.id, dto);
    await this.openMultipartUpload(video);

    const partSize = this.calculatePartSize(video.size_bytes);
    return {
      id: video.id,
      slug: video.slug,
      status: video.status,
      part_size_bytes: partSize,
      part_count: Math.ceil(video.size_bytes / partSize),
    };
  }

  async signUploadParts(
    userId: string,
    slug: string,
    partNumbers: number[],
  ): Promise<SignUploadPartsResponseDto> {
    const video = await this.getOpenUpload(userId, slug);
    const partCount = Math.ceil(
      video.size_bytes / this.calculatePartSize(video.size_bytes),
    );
    if (partNumbers.some((part) => part > partCount)) {
      throw new VideoPartOutOfRangeException();
    }

    const parts = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        part_number: partNumber,
        url: await this.storageService.presignUploadPart(
          video.storage_key,
          video.upload_id as string,
          partNumber,
        ),
      })),
    );
    return { parts, expires_in: UPLOAD_PART_URL_TTL_SECONDS };
  }

  async listUploadedParts(
    userId: string,
    slug: string,
  ): Promise<UploadedPart[]> {
    const video = await this.getOpenUpload(userId, slug);
    return this.storageService.listParts(
      video.storage_key,
      video.upload_id as string,
    );
  }

  private async getOpenUpload(userId: string, slug: string): Promise<Video> {
    const video = await this.getOwnedVideo(userId, slug);
    if (video.status !== VideoStatus.DRAFT) {
      throw new VideoUploadClosedException();
    }
    return video;
  }

  private async getOwnedVideo(userId: string, slug: string): Promise<Video> {
    const video = await this.videoRepository
      .createQueryBuilder('video')
      .addSelect('video.upload_id')
      .innerJoinAndSelect('video.channel', 'channel')
      .where('video.slug = :slug', { slug })
      .getOne();
    if (!video) {
      throw new VideoNotFoundException();
    }
    if (video.channel.user_id !== userId) {
      throw new VideoAccessDeniedException();
    }
    return video;
  }

  private async createDraft(
    channelId: string,
    dto: InitiateUploadDto,
  ): Promise<Video> {
    const id = randomUUID();
    const extension = extname(dto.filename).toLowerCase();
    const safeExtension = SAFE_EXTENSION.test(extension) ? extension : '';

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.videoRepository.save(
          this.videoRepository.create({
            id,
            channel_id: channelId,
            slug: generateSlug(),
            title: dto.title ?? parse(dto.filename).name,
            storage_key: `videos/${id}/original${safeExtension}`,
            original_filename: dto.filename,
            content_type: dto.content_type,
            size_bytes: dto.size_bytes,
          }),
        );
      } catch (err) {
        if (
          attempt >= SLUG_MAX_RETRIES ||
          !isPgUniqueViolationOnColumn(err, SLUG_COLUMN)
        ) {
          throw err;
        }
      }
    }
  }

  private async openMultipartUpload(video: Video): Promise<void> {
    try {
      const uploadId = await this.storageService.createMultipartUpload(
        video.storage_key,
        video.content_type,
      );
      await this.videoRepository.update(video.id, { upload_id: uploadId });
    } catch (err) {
      await this.videoRepository.delete(video.id);
      throw err;
    }
  }

  private calculatePartSize(sizeBytes: number): number {
    return Math.max(
      this.config.partSizeBytes,
      Math.ceil(sizeBytes / MAX_PARTS_PER_UPLOAD),
    );
  }
}
