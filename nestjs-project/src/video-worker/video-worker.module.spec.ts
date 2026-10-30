import { Test } from '@nestjs/testing';
import { FfmpegService } from './ffmpeg.service';
import { VideoProcessor } from './video.processor';
import { VideoWorkerModule } from './video-worker.module';

describe('VideoWorkerModule', () => {
  it('should compile with its processing providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [VideoWorkerModule],
    }).compile();

    expect(moduleRef.get(VideoProcessor)).toBeInstanceOf(VideoProcessor);
    expect(moduleRef.get(FfmpegService)).toBeInstanceOf(FfmpegService);
    await moduleRef.close();
  });
});
