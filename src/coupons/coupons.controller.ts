import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { OptionalAuthService } from '../common/auth/optional-auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller()
export class CouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly optionalAuth: OptionalAuthService,
  ) {}

  @Post('coupons/validate')
  async validate(@Req() req: Request, @Body() dto: ValidateCouponDto) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.couponsService.validate({
      code: dto.code,
      userId: user?.id ?? null,
      cartSubtotal: dto.cartSubtotal,
      productIds: dto.productIds,
      categoryIds: dto.categoryIds,
    });
  }

  @Get('coupons/:code')
  getByCode(@Param('code') code: string) {
    return this.couponsService.getByCode(code);
  }

  @Get('me/coupons')
  @UseGuards(JwtAuthGuard)
  myCoupons(@CurrentUser() user: AuthenticatedUser) {
    return this.couponsService.listAvailableForUser(user.id);
  }
}
