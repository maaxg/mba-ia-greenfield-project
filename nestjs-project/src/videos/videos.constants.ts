export enum VideoStatus {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export const VIDEO_FAILURE_REASON = {
  INVALID_FILE: 'INVALID_VIDEO_FILE',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  ENQUEUE_FAILED: 'ENQUEUE_FAILED',
} as const;

export type VideoFailureReason =
  (typeof VIDEO_FAILURE_REASON)[keyof typeof VIDEO_FAILURE_REASON];

export const VIDEO_QUEUE = {
  NAME: 'video-processing',
  JOB_PROCESS: 'process-video',
  ATTEMPTS: 3,
  BACKOFF_DELAY_MS: 5000,
  FAILED_JOBS_KEPT: 100,
} as const;

export const SLUG_LENGTH = 11;
export const SLUG_MAX_RETRIES = 5;
export const VIDEO_CONTENT_TYPE_PREFIX = 'video/';
export const THUMBNAIL_CONTENT_TYPE = 'image/jpeg';
export const MAX_PARTS_PER_REQUEST = 100;
export const MAX_PARTS_PER_UPLOAD = 10000;
export const THUMBNAIL_FRAME_RATIO = 0.1;
export const THUMBNAIL_MAX_WIDTH = 1280;
