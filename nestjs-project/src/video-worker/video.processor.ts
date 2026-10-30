import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import videoConfig from '../config/video.config';
import { VIDEO_FAILURE_REASON, VIDEO_QUEUE } from '../videos/videos.constants';
import type { ProcessVideoJob } from '../videos/videos.types';
import { VideoProcessingService } from './video-processing.service';
import { InvalidVideoFileError } from './video-worker.errors';

@Processor(VIDEO_QUEUE.NAME)
export class VideoProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    private readonly videoProcessingService: VideoProcessingService,
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.workerConcurrency;
  }

  async process(job: Job<ProcessVideoJob>): Promise<void> {
    try {
      await this.videoProcessingService.process(job.data.videoId);
    } catch (err) {
      if (err instanceof InvalidVideoFileError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ProcessVideoJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) {
      this.logger.error('A job failed without a job reference', error);
      return;
    }

    const isInvalidFile = error instanceof UnrecoverableError;
    const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!isInvalidFile && !attemptsExhausted) {
      return;
    }

    this.logger.error(`Video ${job.data.videoId} failed`, error);
    try {
      await this.videoProcessingService.markFailed(
        job.data.videoId,
        isInvalidFile
          ? VIDEO_FAILURE_REASON.INVALID_FILE
          : VIDEO_FAILURE_REASON.PROCESSING_ERROR,
      );
    } catch (err) {
      this.logger.error(
        `Could not mark video ${job.data.videoId} as failed`,
        err,
      );
    }
  }
}
