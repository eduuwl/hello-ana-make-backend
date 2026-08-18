import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ForbiddenApiException,
  NotFoundApiException,
  ValidationApiException,
} from '../common/exceptions/common.exceptions';
import { ApiException } from '../common/exceptions/api.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { paginate } from '../common/dto/paginated-response.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { AdminOrderQueryDto, OrderQueryDto } from './dto/order-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { toOrderResponse, OrderWithItems } from './mappers/order.mapper';
import { toPaymentResponse } from '../payments/mappers/payment.mapper';
import { AddressesService } from '../addresses/addresses.service';
import { CouponsService, CouponValidationStatus } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { PaymentsService } from '../payments/payments.service';

const CANCELLABLE_STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'processing'];

// docs/09-checkout-pedidos.md → tabela de transições permitidas.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['in_transit', 'delivered', 'returned'],
  in_transit: ['delivered', 'returned'],
  delivered: ['returned', 'refunded'],
  returned: ['refunded'],
  cancelled: [],
  refunded: [],
};

const ORDER_STATUS_TIMESTAMP_FIELD: Partial<Record<OrderStatus, 'paidAt' | 'shippedAt' | 'deliveredAt' | 'cancelledAt'>> = {
  paid: 'paidAt',
  shipped: 'shippedAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
};

const COUPON_ERROR_CODES: Partial<Record<CouponValidationStatus, string>> = {
  invalid: 'COUPON_INVALID',
  expired: 'COUPON_EXPIRED',
  inactive: 'COUPON_INACTIVE',
  min_order_not_met: 'COUPON_MIN_ORDER',
  not_started: 'COUPON_NOT_STARTED',
  usage_limit_reached: 'COUPON_USAGE_LIMIT_REACHED',
  not_applicable: 'COUPON_NOT_APPLICABLE',
  already_used: 'COUPON_ALREADY_USED',
};

// Métodos que não dependem de dado extra do client (token de cartão) — só esses abrem
// cobrança automaticamente na criação do pedido; `credit_card` exige `POST /payments` à parte.
const AUTO_CHARGE_METHODS = new Set(['pix', 'boleto']);

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addressesService: AddressesService,
    private readonly couponsService: CouponsService,
    private readonly shippingService: ShippingService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateOrderDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existing && existing.userId === user.id) {
        return this.toCreateResponse(existing);
      }
    }

    const shippingAddress = await this.addressesService.getById(user.id, dto.shippingAddressId);
    const billingAddress = dto.billingAddressId
      ? await this.addressesService.getById(user.id, dto.billingAddressId)
      : undefined;

    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    const items = dto.items.map((requested) => {
      const variant = variantsById.get(requested.variantId);
      if (!variant || variant.productId !== requested.productId) {
        throw new NotFoundApiException('Variante não encontrada.');
      }
      if (!variant.isAvailable || variant.stock < requested.quantity) {
        throw new ApiException('Estoque insuficiente.', 'STOCK_UNAVAILABLE', 409);
      }

      const unitPrice = toNumber(variant.price);
      const promotionalPrice = variant.promotionalPrice !== null ? toNumber(variant.promotionalPrice) : undefined;
      const lineTotal = round2((promotionalPrice ?? unitPrice) * requested.quantity);

      return {
        productId: variant.productId,
        categoryId: variant.product.categoryId,
        productSlug: variant.product.slug,
        productName: variant.product.name,
        variantId: variant.id,
        variantSku: variant.sku,
        variantName: variant.name,
        attributes: (variant.attributes ?? {}) as Prisma.InputJsonValue,
        image: variant.image ?? '',
        unitPrice: variant.price,
        promotionalPrice: variant.promotionalPrice,
        quantity: requested.quantity,
        lineTotal,
      };
    });

    const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
    if (subtotal <= 0) {
      throw new ValidationApiException({ items: ['O pedido precisa de ao menos um item.'] });
    }

    let discount = 0;
    let couponCode: string | undefined;
    let freeShipping = false;
    if (dto.couponCode) {
      const lines = items.map((i) => ({ productId: i.productId, categoryId: i.categoryId, lineTotal: i.lineTotal }));
      const validation = await this.couponsService.validate({
        code: dto.couponCode,
        userId: user.id,
        cartSubtotal: subtotal,
        productIds: lines.map((l) => l.productId),
        categoryIds: lines.map((l) => l.categoryId),
        lines,
      });
      if (validation.status !== 'valid') {
        throw new ApiException(validation.message, COUPON_ERROR_CODES[validation.status] ?? 'COUPON_INVALID', 422);
      }
      discount = validation.discountAmount;
      couponCode = validation.coupon?.code;
      freeShipping = validation.coupon?.type === 'free_shipping';
    }

    const shippingPrice = this.shippingService.priceFor(dto.shippingOptionId, subtotal);
    const shipping = freeShipping ? 0 : shippingPrice;
    const tax = 0;
    const total = Math.max(0, round2(subtotal - discount + shipping + tax));

    const order = await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const updated = await tx.productVariant.updateMany({
          where: { id: item.variantId, isAvailable: true, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new ApiException('Estoque insuficiente.', 'STOCK_UNAVAILABLE', 409);
        }
      }

      const year = new Date().getFullYear();
      const counter = await tx.orderCounter.upsert({
        where: { year },
        create: { year, value: 1 },
        update: { value: { increment: 1 } },
      });
      const orderNumber = `HA-${year}-${String(counter.value).padStart(4, '0')}`;

      return tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          status: 'pending_payment',
          subtotal,
          discount,
          shipping,
          tax,
          total,
          currency: 'BRL',
          couponCode,
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'pending',
          shippingOptionId: dto.shippingOptionId,
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: billingAddress ? (billingAddress as unknown as Prisma.InputJsonValue) : undefined,
          notes: dto.notes,
          idempotencyKey,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              productSlug: i.productSlug,
              productName: i.productName,
              variantId: i.variantId,
              variantSku: i.variantSku,
              variantName: i.variantName,
              attributes: i.attributes,
              image: i.image,
              unitPrice: i.unitPrice,
              promotionalPrice: i.promotionalPrice,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.clearCart(user.id);

    if (AUTO_CHARGE_METHODS.has(dto.paymentMethod)) {
      await this.paymentsService.createPaymentInternal(order, {
        method: dto.paymentMethod,
        amount: total,
        currency: 'BRL',
      });
    }

    return this.toCreateResponse(order);
  }

  async listMine(user: AuthenticatedUser, query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = { userId: user.id, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows.map(toOrderResponse), total, query.page, query.pageSize);
  }

  async getById(user: AuthenticatedUser, id: string) {
    const order = await this.findByIdOrThrow(id);
    if (user.role !== 'admin' && order.userId !== user.id) {
      throw new ForbiddenApiException();
    }
    return toOrderResponse(order);
  }

  async getByNumber(user: AuthenticatedUser, orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, include: { items: true } });
    if (!order || order.userId !== user.id) {
      throw new NotFoundApiException('Pedido não encontrado.');
    }
    return toOrderResponse(order);
  }

  async cancel(user: AuthenticatedUser, id: string, dto: CancelOrderDto) {
    const order = await this.findByIdOrThrow(id);
    if (order.userId !== user.id) {
      throw new NotFoundApiException('Pedido não encontrado.');
    }
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new ApiException('Este pedido não pode ser cancelado.', 'ORDER_NOT_CANCELLABLE', 422);
    }

    const updated = await this.releaseStockAndUpdate(order, {
      status: 'cancelled',
      cancelledAt: new Date(),
      notes: dto.reason ? this.appendNote(order.notes, `Cancelado: ${dto.reason}`) : undefined,
    });
    return toOrderResponse(updated);
  }

  async adminList(query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows.map(toOrderResponse), total, query.page, query.pageSize);
  }

  async adminGetById(id: string) {
    const order = await this.findByIdOrThrow(id);
    return toOrderResponse(order);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findByIdOrThrow(id);
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (order.status !== dto.status && !allowed.includes(dto.status)) {
      throw new ApiException('Transição de status não permitida.', 'INVALID_STATUS_TRANSITION', 422);
    }

    const releaseStock = dto.status === 'cancelled' && order.status !== 'cancelled';
    const timestampField = ORDER_STATUS_TIMESTAMP_FIELD[dto.status];

    const data: Prisma.OrderUpdateInput = {
      status: dto.status,
      trackingCode: dto.trackingCode,
      trackingUrl: dto.trackingUrl,
      notes: dto.notes,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    };

    const updated = releaseStock
      ? await this.releaseStockAndUpdate(order, data)
      : await this.prisma.order.update({ where: { id }, data, include: { items: true } });

    return toOrderResponse(updated);
  }

  async refund(id: string, amount?: number) {
    await this.findByIdOrThrow(id);
    return this.paymentsService.refundLatestForOrder(id, amount);
  }

  private async releaseStockAndUpdate(
    order: OrderWithItems,
    data: Prisma.OrderUpdateInput,
  ): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.productVariant.updateMany({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
      return tx.order.update({ where: { id: order.id }, data, include: { items: true } });
    });
  }

  private appendNote(existing: string | null, addition: string): string {
    return existing ? `${existing} | ${addition}` : addition;
  }

  private async clearCart(userId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: null, shippingOptionId: null, shippingPrice: null },
    });
  }

  private async toCreateResponse(order: OrderWithItems) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    return { order: toOrderResponse(order), payment: payment ? toPaymentResponse(payment) : undefined };
  }

  private async findByIdOrThrow(id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundApiException('Pedido não encontrado.');
    return order as OrderWithItems;
  }
}
