import { ApiProperty } from '@nestjs/swagger';

export class SignedPartDto {
  @ApiProperty()
  part_number: number;

  @ApiProperty({ description: 'Presigned PUT URL for this part.' })
  url: string;
}

export class SignUploadPartsResponseDto {
  @ApiProperty({ type: [SignedPartDto] })
  parts: SignedPartDto[];

  @ApiProperty({ description: 'Validity of the URLs, in seconds.' })
  expires_in: number;
}
