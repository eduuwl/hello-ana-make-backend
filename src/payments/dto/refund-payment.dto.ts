import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class RefundPaymentDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}
