import {
  Product as ProductModel,
  ProductImage as ProductImageModel,
  ProductVariant as ProductVariantModel,
  ProductBadge as ProductBadgeModel,
  Brand as BrandModel,
  Category as CategoryModel,
  Prisma,
} from '@prisma/client';
import { toBrandResponse } from '../../brands/mappers/brand.mapper';
import { toCategoryResponse } from '../../categories/mappers/category.mapper';

export type ProductWithRelations = ProductModel & {
  brand: BrandModel;
  category: CategoryModel;
  images: ProductImageModel[];
  variants: ProductVariantModel[];
  badges: ProductBadgeModel[];
};

const LOW_STOCK_THRESHOLD = 5;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function effectivePrice(variant: ProductVariantModel): number {
  return variant.promotionalPrice !== null
    ? toNumber(variant.promotionalPrice)
    : toNumber(variant.price);
}

export function toProductResponse(product: ProductWithRelations, isFavorite = false) {
  const variants = product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    attributes: (v.attributes ?? {}) as Record<string, string>,
    price: toNumber(v.price),
    promotionalPrice: v.promotionalPrice !== null ? toNumber(v.promotionalPrice) : undefined,
    stock: v.stock,
    image: v.image ?? undefined,
    isAvailable: v.isAvailable,
  }));

  const prices = product.variants.map((v) => toNumber(v.price));
  const promoPrices = product.variants
    .filter((v) => v.promotionalPrice !== null)
    .map((v) => toNumber(v.promotionalPrice));

  const priceFrom = prices.length ? Math.min(...prices) : 0;
  const priceTo = prices.length ? Math.max(...prices) : 0;
  const promotionalPriceFrom = promoPrices.length ? Math.min(...promoPrices) : undefined;
  const promotionalPriceTo = promoPrices.length ? Math.max(...promoPrices) : undefined;

  const discountPercentage = product.variants.reduce<number | undefined>((max, v) => {
    if (v.promotionalPrice === null) return max;
    const price = toNumber(v.price);
    if (price <= 0) return max;
    const pct = Math.round((1 - toNumber(v.promotionalPrice) / price) * 100);
    return max === undefined ? pct : Math.max(max, pct);
  }, undefined);

  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    ingredients: product.ingredients ?? undefined,
    howToUse: product.howToUse ?? undefined,
    benefits: product.benefits.length ? product.benefits : undefined,
    technicalInfo: (product.technicalInfo as Record<string, string> | null) ?? undefined,
    brand: toBrandResponse(product.brand),
    category: toCategoryResponse(product.category),
    images: product.images
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((img) => ({
        id: img.id,
        url: img.url,
        alt: img.alt,
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
      })),
    variants,
    pricing: {
      priceFrom,
      priceTo,
      promotionalPriceFrom,
      promotionalPriceTo,
      currency: 'BRL',
      discountPercentage,
    },
    inventory: {
      totalStock,
      isInStock: totalStock > 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      isLowStock: totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD,
    },
    rating: {
      average: toNumber(product.ratingAverage),
      count: product.ratingCount,
    },
    badges: product.badges.map((b) => ({
      id: b.id,
      label: b.label,
      type: b.type,
      color: b.color ?? undefined,
    })),
    isFavorite,
    isFeatured: product.isFeatured,
    isNew: product.isNew,
    isBestseller: product.isBestseller,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export { effectivePrice, toNumber };
