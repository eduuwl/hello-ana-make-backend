import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller';
import { BrandsAdminController } from './brands.admin.controller';
import { BrandsService } from './brands.service';

@Module({
  controllers: [BrandsController, BrandsAdminController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
