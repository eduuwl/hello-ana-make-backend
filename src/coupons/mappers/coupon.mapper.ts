import { Coupon as CouponModel, Prisma } from '@prisma/client';

export interface CouponResponse {
  id: string;
  code: string;
  type: string;
  value: number;
  description?: string;
  categoryIds?: string[];
  productIds?: string[];
  minOrderValue?: number;
  maxDiscountValue?: number;
  usageLimit?: number;
  usageCount: number;
  perUserLimit?: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
}

export function toCouponResponse(coupon: CouponModel): CouponResponse {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: toNumber(coupon.value) ?? 0,
    description: coupon.description ?? undefined,
    categoryIds: coupon.categoryIds.length ? coupon.categoryIds : undefined,
    productIds: coupon.productIds.length ? coupon.productIds : undefined,
    minOrderValue: toNumber(coupon.minOrderValue),
    maxDiscountValue: toNumber(coupon.maxDiscountValue),
    usageLimit: coupon.usageLimit ?? undefined,
    usageCount: coupon.usageCount,
    perUserLimit: coupon.perUserLimit ?? undefined,
    startsAt: coupon.startsAt.toISOString(),
    endsAt: coupon.endsAt.toISOString(),
    isActive: coupon.isActive,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}
