import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { VIDEO_QUEUE } from './videos.constants';
import type { ProcessVideoJob } from './videos.types';

@Injectable()
export class VideoQueueService {
  constructor(
    @InjectQueue(VIDEO_QUEUE.NAME)
    private readonly queue: Queue<ProcessVideoJob>,
  ) {}

  async enqueueProcessing(videoId: string): Promise<void> {
    await this.queue.add(
      VIDEO_QUEUE.JOB_PROCESS,
      { videoId },
      {
        jobId: videoId,
        attempts: VIDEO_QUEUE.ATTEMPTS,
        backoff: { type: 'exponential', delay: VIDEO_QUEUE.BACKOFF_DELAY_MS },
        removeOnComplete: true,
        removeOnFail: VIDEO_QUEUE.FAILED_JOBS_KEPT,
      },
    );
  }
}
