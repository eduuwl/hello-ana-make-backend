import { IsIn, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

const ORDER_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'in_transit',
  'delivered',
  'cancelled',
  'refunded',
  'returned',
];

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  trackingUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
