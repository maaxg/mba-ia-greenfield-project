import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { InitiateUploadResponseDto } from './dto/initiate-upload-response.dto';
import { VideosService } from './videos.service';

const errorResponse = (status: number, description: string) =>
  ApiResponse({
    status,
    description,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  });

@ApiTags('videos')
@SkipThrottle()
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @SkipThrottle({ default: false })
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Start a video upload',
    description:
      'Registers the video as a draft, assigns its unique slug and opens a multipart upload in the object storage.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft created and upload opened',
    type: InitiateUploadResponseDto,
  })
  @errorResponse(400, 'Invalid request body')
  @errorResponse(401, 'Missing or invalid access token')
  @errorResponse(404, 'The user has no channel')
  @errorResponse(413, 'File exceeds the maximum allowed size')
  @errorResponse(415, 'File is not a video')
  @errorResponse(429, 'Too many requests')
  initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponseDto> {
    return this.videosService.initiateUpload(user.sub, dto);
  }
}
