import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OptionalAuthService } from '../common/auth/optional-auth.service';
import { CouponsModule } from '../coupons/coupons.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [JwtModule.register({}), CouponsModule, ShippingModule],
  controllers: [CartController],
  providers: [CartService, OptionalAuthService],
  exports: [CartService],
})
export class CartModule {}
