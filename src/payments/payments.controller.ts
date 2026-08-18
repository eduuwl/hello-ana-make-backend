import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto, @Req() req: Request) {
    // IP do cliente — exigido por gateways reais (Asaas) na antifraude de cartão.
    return this.paymentsService.createPayment(user, dto, req.ip);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.getById(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.cancel(user, id);
  }

  @Post(':id/refund')
  @UseGuards(RolesGuard)
  @Roles('admin')
  refund(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    return this.paymentsService.refund(id, dto.amount);
  }
}
