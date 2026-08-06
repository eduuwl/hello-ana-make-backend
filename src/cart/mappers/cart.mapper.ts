import {
  Cart as CartModel,
  CartItem as CartItemModel,
  ProductVariant as ProductVariantModel,
  Prisma,
} from '@prisma/client';

export type CartWithItems = CartModel & { items: CartItemModel[] };

const STORE_MAX_QTY = 10;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toCartResponse(cart: CartWithItems, variantsById: Map<string, ProductVariantModel>) {
  const items = cart.items.map((item) => {
    const variant = variantsById.get(item.variantId);
    const liveStock = variant?.stock ?? 0;
    const isAvailable = Boolean(variant) && (variant?.isAvailable ?? false) && liveStock > 0;
    const maxQuantity = Math.max(0, Math.min(liveStock, STORE_MAX_QTY));
    const unitPrice = toNumber(item.unitPrice);
    const promotionalPrice = item.promotionalPrice !== null ? toNumber(item.promotionalPrice) : undefined;
    const lineTotal = round2((promotionalPrice ?? unitPrice) * item.quantity);

    return {
      id: item.id,
      productId: item.productId,
      productSlug: item.productSlug,
      productName: item.productName,
      variantId: item.variantId,
      variantSku: item.variantSku,
      variantName: item.variantName,
      attributes: (item.attributes ?? {}) as Record<string, string>,
      image: item.image,
      unitPrice,
      promotionalPrice,
      quantity: item.quantity,
      maxQuantity,
      isAvailable,
      lineTotal,
    };
  });

  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  // Cupom (05-cupons.md) e frete (08-frete.md) ainda não implementados — desconto/frete fixos em 0.
  const discount = 0;
  const shipping = 0;
  const tax = 0;
  const total = Math.max(0, round2(subtotal - discount + shipping + tax));
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    id: cart.id,
    items,
    totals: {
      subtotal,
      discount,
      shipping,
      tax,
      total,
      itemCount,
      currency: 'BRL',
    },
    couponCode: cart.couponCode ?? undefined,
    updatedAt: cart.updatedAt.toISOString(),
  };
}
