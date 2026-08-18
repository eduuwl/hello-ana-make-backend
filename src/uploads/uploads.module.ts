import { Module, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { UploadsController } from './uploads.controller';
import { UPLOADS_DIR } from './uploads.constants';

@Module({
  controllers: [UploadsController],
})
export class UploadsModule implements OnModuleInit {
  onModuleInit() {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}
