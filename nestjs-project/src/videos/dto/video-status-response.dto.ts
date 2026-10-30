import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../videos.constants';

export class VideoStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'aZ3kL9xQ2mP' })
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiProperty({ required: false, nullable: true, type: String })
  failure_reason: string | null;

  @ApiProperty({ required: false, nullable: true, type: Number })
  duration_seconds: number | null;

  @ApiProperty()
  has_thumbnail: boolean;

  @ApiProperty({ format: 'date-time' })
  created_at: Date;

  @ApiProperty({ format: 'date-time' })
  updated_at: Date;
}
