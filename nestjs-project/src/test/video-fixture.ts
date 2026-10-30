import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const FIXTURE_DURATION_SECONDS = 2;
export const FIXTURE_WIDTH = 320;
export const FIXTURE_HEIGHT = 240;

export async function createVideoFixture(): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'video-fixture-'));
  const path = join(dir, 'fixture.mp4');

  await execFileAsync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${FIXTURE_DURATION_SECONDS}:size=${FIXTURE_WIDTH}x${FIXTURE_HEIGHT}:rate=15`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${FIXTURE_DURATION_SECONDS}`,
    '-pix_fmt',
    'yuv420p',
    '-shortest',
    path,
  ]);

  const fixture = await readFile(path);
  await rm(dir, { recursive: true });
  return fixture;
}
