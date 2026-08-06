import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShippingQuoteItemDto {
  @IsString()
  productId: string;

  @IsString()
  variantId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightGrams?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  widthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lengthCm?: number;
}

export class ShippingQuoteDto {
  @IsString()
  zipCode: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShippingQuoteItemDto)
  items: ShippingQuoteItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;
}
