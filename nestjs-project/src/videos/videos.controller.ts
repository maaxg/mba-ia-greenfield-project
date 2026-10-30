import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
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
import { ListUploadedPartsResponseDto } from './dto/list-uploaded-parts-response.dto';
import { SignUploadPartsDto } from './dto/sign-upload-parts.dto';
import { SignUploadPartsResponseDto } from './dto/sign-upload-parts-response.dto';
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

  @Post(':slug/upload/parts')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign upload URLs for file parts',
    description:
      'Returns one presigned URL per requested part. The client sends each part directly to the object storage with PUT and keeps the returned ETag.',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned URLs for the requested parts',
    type: SignUploadPartsResponseDto,
  })
  @errorResponse(400, 'Invalid request body or part number out of range')
  @errorResponse(401, 'Missing or invalid access token')
  @errorResponse(403, 'The user does not own this video')
  @errorResponse(404, 'Video not found')
  @errorResponse(409, 'The upload is already closed')
  signUploadParts(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Body() dto: SignUploadPartsDto,
  ): Promise<SignUploadPartsResponseDto> {
    return this.videosService.signUploadParts(user.sub, slug, dto.part_numbers);
  }

  @Get(':slug/upload/parts')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List uploaded parts',
    description:
      'Returns the parts the storage already received, so an interrupted upload can resume.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parts already received by the storage',
    type: ListUploadedPartsResponseDto,
  })
  @errorResponse(401, 'Missing or invalid access token')
  @errorResponse(403, 'The user does not own this video')
  @errorResponse(404, 'Video not found')
  @errorResponse(409, 'The upload is closed or no longer exists')
  async listUploadedParts(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<ListUploadedPartsResponseDto> {
    return {
      parts: await this.videosService.listUploadedParts(user.sub, slug),
    };
  }
}
