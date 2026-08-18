import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AdminOrderQueryDto } from './dto/order-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RefundPaymentDto } from '../payments/dto/refund-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class OrdersAdminController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query() query: AdminOrderQueryDto) {
    return this.ordersService.adminList(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.ordersService.adminGetById(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    return this.ordersService.refund(id, dto.amount);
  }
}
