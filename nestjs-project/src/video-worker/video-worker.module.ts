import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import databaseConfig from '../config/database.config';
import { envValidationSchema } from '../config/env.validation';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { VIDEO_QUEUE } from '../videos/videos.constants';
import { FfmpegService } from './ffmpeg.service';
import { VideoProcessingService } from './video-processing.service';
import { VideoProcessor } from './video.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, queueConfig, storageConfig, videoConfig],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([Video, Channel, User]),
    QueueModule,
    BullModule.registerQueue({ name: VIDEO_QUEUE.NAME }),
    StorageModule,
  ],
  providers: [FfmpegService, VideoProcessingService, VideoProcessor],
})
export class VideoWorkerModule {}
