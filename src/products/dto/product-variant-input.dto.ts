import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ProductVariantAttributesDto {
  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  colorHex?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  volume?: string;

  @IsOptional()
  @IsString()
  fragrance?: string;

  @IsOptional()
  @IsString()
  shade?: string;
}

export class ProductVariantInputDto {
  @IsString()
  @MinLength(1)
  sku: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsObject()
  attributes?: ProductVariantAttributesDto;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  promotionalPrice?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
