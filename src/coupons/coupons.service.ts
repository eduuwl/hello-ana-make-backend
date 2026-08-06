import { Injectable } from '@nestjs/common';
import { Coupon as CouponModel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/dto/paginated-response.dto';
import { UpsertCouponDto } from './dto/upsert-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { toCouponResponse } from './mappers/coupon.mapper';

export type CouponValidationStatus =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'not_started'
  | 'usage_limit_reached'
  | 'min_order_not_met'
  | 'not_applicable'
  | 'already_used'
  | 'inactive';

export interface CartLine {
  productId: string;
  categoryId: string;
  lineTotal: number;
}

export interface ValidateCouponInput {
  code: string;
  userId?: string | null;
  cartSubtotal: number;
  productIds?: string[];
  categoryIds?: string[];
  lines?: CartLine[];
}

export interface CouponValidationResult {
  status: CouponValidationStatus;
  coupon?: ReturnType<typeof toCouponResponse>;
  discountAmount: number;
  message: string;
}

const MESSAGES: Record<CouponValidationStatus, string> = {
  valid: 'Cupom aplicado com sucesso!',
  invalid: 'Cupom inválido.',
  expired: 'Este cupom expirou.',
  not_started: 'Este cupom ainda não está válido.',
  usage_limit_reached: 'Limite de uso deste cupom esgotado.',
  min_order_not_met: 'Valor mínimo não atingido.',
  not_applicable: 'Cupom não se aplica aos produtos do carrinho.',
  already_used: 'Cupom válido apenas para a primeira compra.',
  inactive: 'Este cupom está inativo.',
};

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(input: ValidateCouponInput): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: input.code.trim().toUpperCase() },
    });

    if (!coupon) {
      return this.result('invalid', undefined, 0);
    }

    const now = new Date();

    if (!coupon.isActive) return this.result('inactive', coupon, 0);
    if (now < coupon.startsAt) return this.result('not_started', coupon, 0);
    if (now > coupon.endsAt) return this.result('expired', coupon, 0);
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return this.result('usage_limit_reached', coupon, 0);
    }

    if (input.userId && (coupon.perUserLimit || coupon.firstPurchaseOnly)) {
      const redemptions = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId: input.userId },
      });
      const limit = coupon.perUserLimit ?? 1;
      if (redemptions >= limit) {
        return this.result('already_used', coupon, 0);
      }
    }

    const minOrderValue = toNumber(coupon.minOrderValue);
    if (coupon.minOrderValue !== null && input.cartSubtotal < minOrderValue) {
      return this.result(
        'min_order_not_met',
        coupon,
        0,
        `Valor mínimo de R$ ${minOrderValue.toFixed(2)} não atingido.`,
      );
    }

    if (coupon.type === 'category' || coupon.type === 'product') {
      const scopeIds = coupon.type === 'category' ? coupon.categoryIds : coupon.productIds;
      const contextIds =
        coupon.type === 'category' ? (input.categoryIds ?? []) : (input.productIds ?? []);
      const hasOverlap = scopeIds.some((id) => contextIds.includes(id));
      if (!hasOverlap) {
        return this.result('not_applicable', coupon, 0);
      }
    }

    const discountAmount = this.calculateDiscount(coupon, input.cartSubtotal, input.lines);
    return this.result('valid', coupon, discountAmount);
  }

  isFreeShipping(coupon: Pick<CouponModel, 'type'> | undefined): boolean {
    return coupon?.type === 'free_shipping';
  }

  async consume(couponId: string, userId: string, orderId?: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.coupon.update({ where: { id: couponId }, data: { usageCount: { increment: 1 } } }),
      this.prisma.couponRedemption.create({ data: { couponId, userId, orderId } }),
    ]);
  }

  async adminList(pagination: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.coupon.count(),
    ]);
    return paginate(items.map(toCouponResponse), total, pagination.page, pagination.pageSize);
  }

  async create(dto: UpsertCouponDto) {
    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        type: dto.type,
        value: dto.value,
        description: dto.description,
        categoryIds: dto.categoryIds ?? [],
        productIds: dto.productIds ?? [],
        minOrderValue: dto.minOrderValue,
        maxDiscountValue: dto.maxDiscountValue,
        usageLimit: dto.usageLimit,
        perUserLimit: dto.perUserLimit,
        firstPurchaseOnly: dto.firstPurchaseOnly ?? false,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
      },
    });
    return toCouponResponse(coupon);
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findByIdOrThrow(id);
    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    return toCouponResponse(coupon);
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
  }

  async listAvailableForUser(userId: string) {
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { createdAt: 'desc' },
    });

    const eligible: CouponModel[] = [];
    for (const coupon of coupons) {
      if (!coupon.perUserLimit && !coupon.firstPurchaseOnly) {
        eligible.push(coupon);
        continue;
      }
      const redemptions = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (redemptions < (coupon.perUserLimit ?? 1)) {
        eligible.push(coupon);
      }
    }

    return { items: eligible.map(toCouponResponse) };
  }

  async getByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!coupon) throw new NotFoundApiException('Cupom não encontrado.');
    return toCouponResponse(coupon);
  }

  private calculateDiscount(coupon: CouponModel, subtotal: number, lines?: CartLine[]): number {
    if (coupon.type === 'free_shipping') return 0;

    let discountAmount: number;

    if (coupon.type === 'category' || coupon.type === 'product') {
      const scopeIds = coupon.type === 'category' ? coupon.categoryIds : coupon.productIds;
      const base = lines
        ? lines
            .filter((line) =>
              coupon.type === 'category'
                ? scopeIds.includes(line.categoryId)
                : scopeIds.includes(line.productId),
            )
            .reduce((sum, line) => sum + line.lineTotal, 0)
        : subtotal;
      discountAmount = base * (toNumber(coupon.value) / 100);
    } else if (coupon.type === 'fixed_amount') {
      discountAmount = toNumber(coupon.value);
    } else {
      discountAmount = subtotal * (toNumber(coupon.value) / 100);
    }

    if (coupon.maxDiscountValue !== null) {
      discountAmount = Math.min(discountAmount, toNumber(coupon.maxDiscountValue));
    }
    discountAmount = Math.min(discountAmount, subtotal);
    return round2(Math.max(0, discountAmount));
  }

  private result(
    status: CouponValidationStatus,
    coupon: CouponModel | undefined,
    discountAmount: number,
    message?: string,
  ): CouponValidationResult {
    return {
      status,
      coupon: coupon ? toCouponResponse(coupon) : undefined,
      discountAmount,
      message: message ?? MESSAGES[status],
    };
  }

  private async findByIdOrThrow(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundApiException('Cupom não encontrado.');
    return coupon;
  }
}
