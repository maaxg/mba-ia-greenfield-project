import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import type { VideoMetadata } from '../videos/entities/video.entity';
import { THUMBNAIL_MAX_WIDTH } from '../videos/videos.constants';
import { InvalidVideoFileError } from './video-worker.errors';

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const INVALID_INPUT_MESSAGE = 'Invalid data found';
const REDACTED_INPUT = '<video source>';

export interface VideoProbe {
  durationSeconds: number;
  metadata: VideoMetadata;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string; format_name?: string };
}

function parseFrameRate(rate: string | undefined): number | null {
  const [numerator, denominator] = (rate ?? '').split('/').map(Number);
  return denominator ? numerator / denominator : null;
}

function parseOptionalNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class FfmpegService {
  async probe(input: string): Promise<VideoProbe> {
    const stdout = await this.run('ffprobe', input, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      input,
    ]);
    const output = JSON.parse(stdout.toString()) as FfprobeOutput;

    const streams = output.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === 'video');
    const audio = streams.find((stream) => stream.codec_type === 'audio');
    const durationSeconds = parseOptionalNumber(output.format?.duration);

    if (!video || !durationSeconds) {
      throw new InvalidVideoFileError('File has no playable video stream');
    }

    return {
      durationSeconds,
      metadata: {
        width: video.width ?? null,
        height: video.height ?? null,
        video_codec: video.codec_name ?? null,
        audio_codec: audio?.codec_name ?? null,
        bitrate: parseOptionalNumber(output.format?.bit_rate),
        frame_rate: parseFrameRate(video.avg_frame_rate),
        format_name: output.format?.format_name ?? null,
      },
    };
  }

  async extractFrame(input: string, atSeconds: number): Promise<Buffer> {
    const frame = await this.run('ffmpeg', input, [
      '-v',
      'error',
      '-ss',
      atSeconds.toFixed(3),
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      `scale='min(${THUMBNAIL_MAX_WIDTH},iw)':-2`,
      '-q:v',
      '3',
      '-f',
      'image2pipe',
      '-c:v',
      'mjpeg',
      'pipe:1',
    ]);

    if (frame.length === 0) {
      throw new InvalidVideoFileError('No frame could be extracted');
    }
    return frame;
  }

  private async run(
    command: string,
    input: string,
    args: string[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const timeout = setTimeout(
        () => child.kill('SIGKILL'),
        COMMAND_TIMEOUT_MS,
      );

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(Buffer.concat(stdout));
          return;
        }
        // FFmpeg echoes its input, and a signed URL must not reach the logs.
        const message = Buffer.concat(stderr)
          .toString()
          .replaceAll(input, REDACTED_INPUT)
          .trim();
        reject(
          message.includes(INVALID_INPUT_MESSAGE)
            ? new InvalidVideoFileError(message)
            : new Error(`${command} failed: ${message}`),
        );
      });
    });
  }
}
