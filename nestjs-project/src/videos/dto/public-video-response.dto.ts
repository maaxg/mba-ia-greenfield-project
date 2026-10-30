import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../videos.constants';

export class VideoMetadataDto {
  @ApiProperty({ type: Number, required: false, nullable: true })
  width: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  height: number | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  video_codec: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  audio_codec: string | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  bitrate: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  frame_rate: number | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  format_name: string | null;
}

export class PublicVideoResponseDto {
  @ApiProperty({ example: 'aZ3kL9xQ2mP' })
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: [VideoStatus.READY], example: VideoStatus.READY })
  status: VideoStatus;

  @ApiProperty()
  duration_seconds: number;

  @ApiProperty({ type: VideoMetadataDto })
  metadata: VideoMetadataDto;

  @ApiProperty()
  size_bytes: number;

  @ApiProperty({ format: 'date-time' })
  created_at: Date;
}
