import { Body, Controller, Get, HttpCode, HttpStatus, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.create(user, dto, idempotencyKey);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderQueryDto) {
    return this.ordersService.listMine(user, query);
  }

  @Get('by-number/:orderNumber')
  getByNumber(@CurrentUser() user: AuthenticatedUser, @Param('orderNumber') orderNumber: string) {
    return this.ordersService.getByNumber(user, orderNumber);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.getById(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancel(user, id, dto);
  }
}
