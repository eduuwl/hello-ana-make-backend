import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { OptionalAuthService } from '../common/auth/optional-auth.service';

@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly optionalAuth: OptionalAuthService,
  ) {}

  @Get()
  async getCart(@Req() req: Request, @Headers('x-cart-id') cartId?: string) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.cartService.getCart(user, cartId);
  }

  @Post('items')
  async addItem(
    @Req() req: Request,
    @Body() dto: AddCartItemDto,
    @Headers('x-cart-id') cartId?: string,
  ) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.cartService.addItem(user, cartId, dto);
  }

  @Patch('items/:itemId')
  async updateItem(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-cart-id') cartId?: string,
  ) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.cartService.updateItemQuantity(user, cartId, itemId, dto);
  }

  @Delete('items/:itemId')
  async removeItem(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Headers('x-cart-id') cartId?: string,
  ) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.cartService.removeItem(user, cartId, itemId);
  }

  @Delete()
  async clear(@Req() req: Request, @Headers('x-cart-id') cartId?: string) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.cartService.clear(user, cartId);
  }
}
