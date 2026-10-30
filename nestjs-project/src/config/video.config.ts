import { registerAs } from '@nestjs/config';

export default registerAs('video', () => ({
  maxSizeBytes: parseInt(process.env.VIDEO_MAX_SIZE_BYTES || '10737418240', 10),
  partSizeBytes: parseInt(process.env.VIDEO_PART_SIZE_BYTES || '67108864', 10),
  workerConcurrency: parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '2', 10),
}));
