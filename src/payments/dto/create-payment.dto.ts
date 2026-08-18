import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

const PAYMENT_METHODS: PaymentMethod[] = [
  'credit_card',
  'debit_card',
  'pix',
  'boleto',
  'wallet',
  'store_credit',
];

export class CardPaymentDataDto {
  @IsString()
  token: string;

  @IsInt()
  @Min(1)
  installments: number;

  @IsString()
  holderName: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  lastFourDigits?: string;
}

export class PixPaymentDataDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  expiresInSeconds?: number;
}

export class CreatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsIn(PAYMENT_METHODS)
  method: PaymentMethod;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardPaymentDataDto)
  card?: CardPaymentDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PixPaymentDataDto)
  pix?: PixPaymentDataDto;

  @IsOptional()
  @IsString()
  returnUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
