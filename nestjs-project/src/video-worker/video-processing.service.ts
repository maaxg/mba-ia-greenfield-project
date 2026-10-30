import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { Video } from '../videos/entities/video.entity';
import {
  THUMBNAIL_CONTENT_TYPE,
  THUMBNAIL_FRAME_RATIO,
  VideoFailureReason,
  VideoStatus,
} from '../videos/videos.constants';
import { FfmpegService } from './ffmpeg.service';

@Injectable()
export class VideoProcessingService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async process(videoId: string): Promise<void> {
    const video = await this.videoRepository.findOneBy({ id: videoId });
    if (video?.status !== VideoStatus.PROCESSING) {
      return;
    }

    const source = await this.storageService.presignInternalGetObject(
      video.storage_key,
    );
    const { durationSeconds, metadata } =
      await this.ffmpegService.probe(source);
    const frame = await this.ffmpegService.extractFrame(
      source,
      durationSeconds * THUMBNAIL_FRAME_RATIO,
    );

    const thumbnailKey = `videos/${video.id}/thumbnail.jpg`;
    await this.storageService.putObject(
      thumbnailKey,
      frame,
      THUMBNAIL_CONTENT_TYPE,
    );

    await this.videoRepository.update(
      { id: video.id, status: VideoStatus.PROCESSING },
      {
        status: VideoStatus.READY,
        duration_seconds: durationSeconds,
        metadata,
        thumbnail_key: thumbnailKey,
      },
    );
  }

  async markFailed(videoId: string, reason: VideoFailureReason): Promise<void> {
    await this.videoRepository.update(
      { id: videoId, status: VideoStatus.PROCESSING },
      { status: VideoStatus.FAILED, failure_reason: reason },
    );
  }
}
