import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BuyXGetYDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buyQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  getQuantity: number;

  @IsBoolean()
  applyToCheapest: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  getDiscountPercentage: number;
}

export class ProgressiveDiscountTierDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage: number;
}

export class KitItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
