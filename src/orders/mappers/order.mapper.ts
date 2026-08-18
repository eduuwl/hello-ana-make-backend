import { Order as OrderModel, OrderItem as OrderItemModel, Prisma } from '@prisma/client';
import { AddressResponse } from '../../addresses/mappers/address.mapper';

export type OrderWithItems = OrderModel & { items: OrderItemModel[] };

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function toOrderItemResponse(item: OrderItemModel) {
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
    unitPrice: toNumber(item.unitPrice),
    promotionalPrice: item.promotionalPrice !== null ? toNumber(item.promotionalPrice) : undefined,
    quantity: item.quantity,
    lineTotal: toNumber(item.lineTotal),
  };
}

export function toOrderResponse(order: OrderWithItems) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    items: order.items.map(toOrderItemResponse),
    shippingAddress: order.shippingAddress as unknown as AddressResponse,
    billingAddress: order.billingAddress ? (order.billingAddress as unknown as AddressResponse) : undefined,
    subtotal: toNumber(order.subtotal),
    discount: toNumber(order.discount),
    shipping: toNumber(order.shipping),
    tax: toNumber(order.tax),
    total: toNumber(order.total),
    currency: order.currency,
    couponCode: order.couponCode ?? undefined,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentId: order.paymentId ?? undefined,
    shippingOptionId: order.shippingOptionId ?? undefined,
    trackingCode: order.trackingCode ?? undefined,
    trackingUrl: order.trackingUrl ?? undefined,
    notes: order.notes ?? undefined,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paidAt: order.paidAt?.toISOString(),
    shippedAt: order.shippedAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString(),
  };
}
