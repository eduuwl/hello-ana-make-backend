import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORT_BY_VALUES = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'bestseller',
  'rating',
  'name_asc',
  'name_desc',
] as const;

export type ProductSortBy = (typeof SORT_BY_VALUES)[number];

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;
const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SORT_BY_VALUES)
  sortBy: ProductSortBy = 'relevance';

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  brandIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  inStockOnly?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isNew?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isBestseller?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onSale?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ratingMin?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  /** Admin only: inclui produtos com isActive=false. Ignorado nas rotas públicas. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeInactive?: boolean;
}
