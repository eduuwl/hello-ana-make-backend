import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CouponsController } from './coupons.controller';
import { CouponsAdminController } from './coupons.admin.controller';
import { CouponsService } from './coupons.service';
import { OptionalAuthService } from '../common/auth/optional-auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CouponsController, CouponsAdminController],
  providers: [CouponsService, OptionalAuthService],
  exports: [CouponsService],
})
export class CouponsModule {}
