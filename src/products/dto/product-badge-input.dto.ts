import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const BADGE_TYPES = [
  'new',
  'bestseller',
  'exclusive',
  'limited',
  'sale',
  'eco',
  'vegan',
  'custom',
] as const;

export class ProductBadgeInputDto {
  @IsString()
  @MinLength(1)
  label: string;

  @IsIn(BADGE_TYPES)
  type: (typeof BADGE_TYPES)[number];

  @IsOptional()
  @IsString()
  color?: string;
}
