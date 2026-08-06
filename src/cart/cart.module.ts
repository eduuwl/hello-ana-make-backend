import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OptionalAuthService } from '../common/auth/optional-auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CartController],
  providers: [CartService, OptionalAuthService],
  exports: [CartService],
})
export class CartModule {}
