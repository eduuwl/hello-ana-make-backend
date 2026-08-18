import { Prisma } from '@prisma/client';
import { ProductSortBy } from './dto/product-query.dto';

export function buildProductOrderBy(sortBy: ProductSortBy): Prisma.ProductOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'price_asc':
      return [{ minEffectivePrice: 'asc' }];
    case 'price_desc':
      return [{ maxEffectivePrice: 'desc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'bestseller':
      return [{ isBestseller: 'desc' }, { createdAt: 'desc' }];
    case 'rating':
      return [{ ratingAverage: 'desc' }];
    case 'name_asc':
      return [{ name: 'asc' }];
    case 'name_desc':
      return [{ name: 'desc' }];
    case 'relevance':
    default:
      return [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
  }
}
