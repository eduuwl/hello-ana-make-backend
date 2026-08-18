import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ProductSortBy } from '../../products/dto/product-query.dto';

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

export class FavoritesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SORT_BY_VALUES)
  sortBy: ProductSortBy = 'relevance';
}
