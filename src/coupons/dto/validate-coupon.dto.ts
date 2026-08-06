import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  code: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cartSubtotal: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
