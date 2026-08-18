import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RewardsController } from './rewards.controller';
import { RewardsAdminController } from './rewards.admin.controller';
import { RewardsService } from './rewards.service';
import { CartModule } from '../cart/cart.module';
import { OptionalAuthService } from '../common/auth/optional-auth.service';

@Module({
  imports: [JwtModule.register({}), CartModule],
  controllers: [RewardsController, RewardsAdminController],
  providers: [RewardsService, OptionalAuthService],
  exports: [RewardsService],
})
export class RewardsModule {}
