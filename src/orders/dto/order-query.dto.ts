import { IsIn, IsOptional } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

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

export class OrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
}

export class AdminOrderQueryDto extends OrderQueryDto {
  @IsOptional()
  search?: string;

  @IsOptional()
  from?: string;

  @IsOptional()
  to?: string;
}
