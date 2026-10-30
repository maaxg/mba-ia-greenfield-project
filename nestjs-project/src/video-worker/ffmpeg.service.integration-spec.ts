import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createVideoFixture,
  FIXTURE_DURATION_SECONDS,
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
} from '../test/video-fixture';
import { FfmpegService } from './ffmpeg.service';
import { InvalidVideoFileError } from './video-worker.errors';

describe('FfmpegService (integration)', () => {
  const service = new FfmpegService();
  let dir: string;
  let videoPath: string;
  let garbagePath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ffmpeg-spec-'));
    videoPath = join(dir, 'video.mp4');
    garbagePath = join(dir, 'garbage.mp4');
    await writeFile(videoPath, await createVideoFixture());
    await writeFile(garbagePath, Buffer.from('this is not a video'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true });
  });

  it('should extract duration and metadata from a video', async () => {
    const { durationSeconds, metadata } = await service.probe(videoPath);

    expect(durationSeconds).toBeCloseTo(FIXTURE_DURATION_SECONDS, 0);
    expect(metadata.width).toBe(FIXTURE_WIDTH);
    expect(metadata.height).toBe(FIXTURE_HEIGHT);
    expect(metadata.video_codec).toBe('h264');
    expect(metadata.audio_codec).toBe('aac');
    expect(metadata.frame_rate).toBe(15);
    expect(metadata.bitrate).toBeGreaterThan(0);
  });

  it('should extract a JPEG frame', async () => {
    const frame = await service.extractFrame(videoPath, 0.2);

    expect(frame.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('should reject a file that is not a video', async () => {
    await expect(service.probe(garbagePath)).rejects.toThrow(
      InvalidVideoFileError,
    );
  });

  it('should report an unreachable source as a transient failure', async () => {
    const error = await service
      .probe('http://minio:9000/missing')
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(InvalidVideoFileError);
  });
});
