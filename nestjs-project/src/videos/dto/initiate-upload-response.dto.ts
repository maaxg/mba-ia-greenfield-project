import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../videos.constants';

export class InitiateUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'aZ3kL9xQ2mP' })
  slug: string;

  @ApiProperty({ enum: VideoStatus, example: VideoStatus.DRAFT })
  status: VideoStatus;

  @ApiProperty({ description: 'Size of every part except the last one.' })
  part_size_bytes: number;

  @ApiProperty({ description: 'Number of parts the file must be split into.' })
  part_count: number;
}
