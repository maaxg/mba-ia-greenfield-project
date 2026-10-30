import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class InitiateUploadDto {
  /** Original file name, including its extension. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  /** Exact size of the file in bytes. */
  @IsInt()
  @Min(1)
  size_bytes: number;

  /** MIME type of the file. Must be a `video/*` type. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  content_type: string;

  /** Video title. Defaults to the file name without its extension. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;
}
