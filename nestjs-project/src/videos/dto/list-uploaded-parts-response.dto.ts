import { ApiProperty } from '@nestjs/swagger';

export class UploadedPartDto {
  @ApiProperty()
  part_number: number;

  @ApiProperty()
  etag: string;

  @ApiProperty()
  size_bytes: number;
}

export class ListUploadedPartsResponseDto {
  @ApiProperty({ type: [UploadedPartDto] })
  parts: UploadedPartDto[];
}
