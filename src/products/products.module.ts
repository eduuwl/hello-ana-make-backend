import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProductsController } from './products.controller';
import { ProductsAdminController } from './products.admin.controller';
import { ProductsService } from './products.service';
import { PromotionsModule } from '../promotions/promotions.module';
import { OptionalAuthService } from '../common/auth/optional-auth.service';

@Module({
  imports: [JwtModule.register({}), PromotionsModule],
  controllers: [ProductsController, ProductsAdminController],
  providers: [ProductsService, OptionalAuthService],
  exports: [ProductsService],
})
export class ProductsModule {}
