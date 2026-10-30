import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Redirect,
} from '@nestjs/common';
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
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CompleteUploadResponseDto } from './dto/complete-upload-response.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { InitiateUploadResponseDto } from './dto/initiate-upload-response.dto';
import { PublicVideoResponseDto } from './dto/public-video-response.dto';
import { ListUploadedPartsResponseDto } from './dto/list-uploaded-parts-response.dto';
import { SignUploadPartsDto } from './dto/sign-upload-parts.dto';
import { SignUploadPartsResponseDto } from './dto/sign-upload-parts-response.dto';
import { VideoStatusResponseDto } from './dto/video-status-response.dto';
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

  @Post(':slug/upload/complete')
  @HttpCode(202)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Complete a video upload',
    description:
      'Verifies the uploaded parts, assembles the file in the storage and queues the video for background processing.',
  })
  @ApiResponse({
    status: 202,
    description: 'Upload closed and processing queued',
    type: CompleteUploadResponseDto,
  })
  @errorResponse(400, 'Invalid request body')
  @errorResponse(401, 'Missing or invalid access token')
  @errorResponse(403, 'The user does not own this video')
  @errorResponse(404, 'Video not found')
  @errorResponse(409, 'The upload is closed or no longer exists')
  @errorResponse(422, 'Uploaded parts do not match the declared file')
  @errorResponse(503, 'The processing queue is unavailable')
  completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponseDto> {
    return this.videosService.completeUpload(user.sub, slug, dto.parts);
  }

  @Delete(':slug/upload')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cancel a video upload',
    description:
      'Aborts the multipart upload in the storage and removes the draft.',
  })
  @ApiResponse({ status: 204, description: 'Upload cancelled' })
  @errorResponse(401, 'Missing or invalid access token')
  @errorResponse(403, 'The user does not own this video')
  @errorResponse(404, 'Video not found')
  @errorResponse(409, 'The upload is already closed')
  cancelUpload(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<void> {
    return this.videosService.cancelUpload(user.sub, slug);
  }

  @Get(':slug/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the status of an owned video',
    description:
      'Returns the processing state of the video in any status, including the failure reason.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current status of the video',
    type: VideoStatusResponseDto,
  })
  @errorResponse(401, 'Missing or invalid access token')
  @errorResponse(403, 'The user does not own this video')
  @errorResponse(404, 'Video not found')
  getVideoStatus(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<VideoStatusResponseDto> {
    return this.videosService.getVideoStatus(user.sub, slug);
  }

  @Public()
  @Get(':slug/stream')
  @Redirect()
  @ApiOperation({
    summary: 'Stream a video',
    description:
      'Redirects to a signed storage URL that honors Range requests with 206 Partial Content.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the signed URL' })
  @errorResponse(404, 'Video not found or not ready')
  async streamVideo(@Param('slug') slug: string): Promise<{ url: string }> {
    return { url: await this.videosService.getStreamUrl(slug) };
  }

  @Public()
  @Get(':slug/download')
  @Redirect()
  @ApiOperation({
    summary: 'Download a video',
    description:
      'Redirects to a signed storage URL that serves the file as an attachment.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the signed URL' })
  @errorResponse(404, 'Video not found or not ready')
  async downloadVideo(@Param('slug') slug: string): Promise<{ url: string }> {
    return { url: await this.videosService.getDownloadUrl(slug) };
  }

  @Public()
  @Get(':slug/thumbnail')
  @Redirect()
  @ApiOperation({
    summary: 'Get a video thumbnail',
    description: 'Redirects to a signed storage URL of the generated JPEG.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the signed URL' })
  @errorResponse(404, 'Video not found or not ready')
  async getThumbnail(@Param('slug') slug: string): Promise<{ url: string }> {
    return { url: await this.videosService.getThumbnailUrl(slug) };
  }

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'Get a video by its unique URL',
    description: 'Returns a processed video. Anonymous access is allowed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Processed video',
    type: PublicVideoResponseDto,
  })
  @errorResponse(404, 'Video not found or not ready')
  getPublicVideo(@Param('slug') slug: string): Promise<PublicVideoResponseDto> {
    return this.videosService.getPublicVideo(slug);
  }
}
