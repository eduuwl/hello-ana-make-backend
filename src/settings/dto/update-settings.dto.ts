import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsISO8601, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class UpdateStoreGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  instagramUrl?: string;
}

class UpdateCheckoutGroupDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledPaymentMethods?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxInstallments?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minInstallmentAmount?: number;

  @IsOptional()
  @IsBoolean()
  allowGuestCheckout?: boolean;
}

class FreeShippingThresholdsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PAC?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  SEDEX?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  EXPRESSA?: number | null;
}

class UpdateShippingGroupDto {
  @IsOptional()
  @IsString()
  originZipCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultWeightGrams?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultWidthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultHeightCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultLengthCm?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => FreeShippingThresholdsDto)
  freeShippingThresholds?: FreeShippingThresholdsDto;
}

class UpdateRewardsGroupDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class UpdateSignupPromotionGroupDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class UpdateStoreSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateStoreGroupDto)
  store?: UpdateStoreGroupDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCheckoutGroupDto)
  checkout?: UpdateCheckoutGroupDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateShippingGroupDto)
  shipping?: UpdateShippingGroupDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRewardsGroupDto)
  rewards?: UpdateRewardsGroupDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSignupPromotionGroupDto)
  signupPromotion?: UpdateSignupPromotionGroupDto;

  @IsOptional()
  @IsIn(['BRL'])
  currency?: 'BRL';

  @IsOptional()
  @IsString()
  timezone?: string;
}
