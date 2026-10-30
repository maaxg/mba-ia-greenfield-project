import { UnrecoverableError } from 'bullmq';
import { VIDEO_FAILURE_REASON } from '../videos/videos.constants';
import { VideoProcessor } from './video.processor';
import { InvalidVideoFileError } from './video-worker.errors';

describe('VideoProcessor', () => {
  let processing: Record<string, jest.Mock>;
  let processor: VideoProcessor;

  const job = (attemptsMade: number) =>
    ({
      data: { videoId: 'video-id' },
      attemptsMade,
      opts: { attempts: 3 },
    }) as any;

  beforeEach(() => {
    processing = { process: jest.fn(), markFailed: jest.fn() };
    processor = new VideoProcessor(processing as any, {} as any);
    jest.spyOn((processor as any).logger, 'error').mockImplementation();
  });

  describe('process', () => {
    it('should process the video of the job', async () => {
      await processor.process(job(0));

      expect(processing.process).toHaveBeenCalledWith('video-id');
    });

    it('should stop retrying an invalid file', async () => {
      processing.process.mockRejectedValue(new InvalidVideoFileError('bad'));

      await expect(processor.process(job(0))).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it('should let transient errors reach the retry policy', async () => {
      const error = new Error('network');
      processing.process.mockRejectedValue(error);

      await expect(processor.process(job(0))).rejects.toBe(error);
    });
  });

  describe('onFailed', () => {
    it('should wait for the remaining attempts', async () => {
      await processor.onFailed(job(1), new Error('network'));

      expect(processing.markFailed).not.toHaveBeenCalled();
    });

    it('should fail the video when attempts run out', async () => {
      await processor.onFailed(job(3), new Error('network'));

      expect(processing.markFailed).toHaveBeenCalledWith(
        'video-id',
        VIDEO_FAILURE_REASON.PROCESSING_ERROR,
      );
    });

    it('should fail an invalid file on the first attempt', async () => {
      await processor.onFailed(job(1), new UnrecoverableError('bad'));

      expect(processing.markFailed).toHaveBeenCalledWith(
        'video-id',
        VIDEO_FAILURE_REASON.INVALID_FILE,
      );
    });

    it('should tolerate a failure without a job reference', async () => {
      await expect(
        processor.onFailed(undefined, new Error('stalled')),
      ).resolves.toBeUndefined();
    });

    it('should not crash when the failure cannot be recorded', async () => {
      processing.markFailed.mockRejectedValue(new Error('database'));

      await expect(
        processor.onFailed(job(3), new Error('network')),
      ).resolves.toBeUndefined();
    });
  });
});
