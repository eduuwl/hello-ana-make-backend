import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
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

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  variantId: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsUUID()
  shippingAddressId: string;

  @IsOptional()
  @IsUUID()
  billingAddressId?: string;

  @IsString()
  shippingOptionId: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
