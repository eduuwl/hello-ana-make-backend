import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsAdminController } from './promotions.admin.controller';
import { PromotionsService } from './promotions.service';

@Module({
  controllers: [PromotionsController, PromotionsAdminController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
