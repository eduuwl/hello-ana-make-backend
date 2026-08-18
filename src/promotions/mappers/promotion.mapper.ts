import { Promotion as PromotionModel, Prisma } from '@prisma/client';
import { ActivePromotionView } from '../../products/mappers/product.mapper';

export interface BuyXGetYRule {
  buyQuantity: number;
  getQuantity: number;
  applyToCheapest: boolean;
  getDiscountPercentage: number;
}

export interface ProgressiveDiscountTier {
  minQuantity: number;
  discountPercentage: number;
}

export interface KitItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface PromotionResponse {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  discountPercentage?: number;
  discountAmount?: number;
  buyXGetY?: BuyXGetYRule;
  progressiveTiers?: ProgressiveDiscountTier[];
  kitItems?: KitItem[];
  kitPrice?: number;
  productIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  bannerImage?: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
}

export function toPromotionResponse(promotion: PromotionModel): PromotionResponse {
  return {
    id: promotion.id,
    slug: promotion.slug,
    name: promotion.name,
    description: promotion.description,
    type: promotion.type,
    discountPercentage: toNumber(promotion.discountPercentage),
    discountAmount: toNumber(promotion.discountAmount),
    buyXGetY: (promotion.buyXGetY as unknown as BuyXGetYRule | null) ?? undefined,
    progressiveTiers: (promotion.progressiveTiers as unknown as ProgressiveDiscountTier[] | null) ?? undefined,
    kitItems: (promotion.kitItems as unknown as KitItem[] | null) ?? undefined,
    kitPrice: toNumber(promotion.kitPrice),
    productIds: promotion.productIds.length ? promotion.productIds : undefined,
    categoryIds: promotion.categoryIds.length ? promotion.categoryIds : undefined,
    brandIds: promotion.brandIds.length ? promotion.brandIds : undefined,
    bannerImage: promotion.bannerImage ?? undefined,
    startsAt: promotion.startsAt.toISOString(),
    endsAt: promotion.endsAt.toISOString(),
    isActive: promotion.isActive,
    priority: promotion.priority,
    createdAt: promotion.createdAt.toISOString(),
    updatedAt: promotion.updatedAt.toISOString(),
  };
}

// Só direct_discount/flash_sale/buy_x_get_y mapeiam para o badge de Product.promotion
// (01-produtos.md → ProductPromotion); progressive/kit/campaign são conceitos de
// carrinho/editorial sem uma representação 1:1 por produto.
const CATALOG_TYPE_MAP: Partial<Record<string, ActivePromotionView['type']>> = {
  flash_sale: 'flash_sale',
  buy_x_get_y: 'buy_x_get_y',
};

export function toActivePromotionView(promotion: PromotionModel): ActivePromotionView {
  const type =
    CATALOG_TYPE_MAP[promotion.type] ??
    (promotion.discountPercentage !== null ? 'percentage' : 'fixed_amount');

  const value =
    promotion.type === 'buy_x_get_y'
      ? ((promotion.buyXGetY as unknown as BuyXGetYRule | null)?.getDiscountPercentage ?? 0)
      : (toNumber(promotion.discountPercentage) ?? toNumber(promotion.discountAmount) ?? 0);

  return {
    id: promotion.id,
    label: promotion.name,
    type,
    value,
    startsAt: promotion.startsAt.toISOString(),
    endsAt: promotion.endsAt.toISOString(),
    isActive: promotion.isActive,
  };
}
