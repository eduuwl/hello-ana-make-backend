import { Controller, Get, Headers, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RewardsService } from './rewards.service';
import { CartService } from '../cart/cart.service';
import { OptionalAuthService } from '../common/auth/optional-auth.service';
import { RewardProgressQueryDto } from './dto/reward-progress-query.dto';

@Controller('rewards')
export class RewardsController {
  constructor(
    private readonly rewardsService: RewardsService,
    private readonly cartService: CartService,
    private readonly optionalAuth: OptionalAuthService,
  ) {}

  @Get('tiers')
  listTiers() {
    return this.rewardsService.listTiers();
  }

  @Get('progress')
  async getProgress(
    @Req() req: Request,
    @Query() query: RewardProgressQueryDto,
    @Headers('x-cart-id') cartId?: string,
  ) {
    let eligibleAmount = query.eligibleAmount;
    if (eligibleAmount === undefined) {
      const user = await this.optionalAuth.getUserFromRequest(req);
      eligibleAmount = await this.cartService.computeEligibleAmount(user, cartId);
    }
    return this.rewardsService.getProgress(eligibleAmount);
  }
}
