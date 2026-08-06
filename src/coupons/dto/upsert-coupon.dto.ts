import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const COUPON_TYPES = ['percentage', 'fixed_amount', 'free_shipping', 'category', 'product'] as const;

export class UpsertCouponDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsIn(COUPON_TYPES)
  type: (typeof COUPON_TYPES)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscountValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsBoolean()
  firstPurchaseOnly?: boolean;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
