import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { MAX_PARTS_PER_REQUEST } from '../videos.constants';

export class SignUploadPartsDto {
  /** Part numbers to sign, starting at 1. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PARTS_PER_REQUEST)
  @IsInt({ each: true })
  @Min(1, { each: true })
  part_numbers: number[];
}
