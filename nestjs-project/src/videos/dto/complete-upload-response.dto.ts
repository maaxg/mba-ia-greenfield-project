import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../videos.constants';

export class CompleteUploadResponseDto {
  @ApiProperty({ example: 'aZ3kL9xQ2mP' })
  slug: string;

  @ApiProperty({ enum: VideoStatus, example: VideoStatus.PROCESSING })
  status: VideoStatus;
}
