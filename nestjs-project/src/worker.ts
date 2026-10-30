import { NestFactory } from '@nestjs/core';
import { VideoWorkerModule } from './video-worker/video-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(VideoWorkerModule);
  app.enableShutdownHooks();
}
void bootstrap();
