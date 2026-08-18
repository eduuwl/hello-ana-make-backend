import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/dto/paginated-response.dto';
import { effectivePrice, ActivePromotionView } from '../products/mappers/product.mapper';
import { PromotionQueryDto } from './dto/promotion-query.dto';
import { PromotionPreviewDto } from './dto/promotion-preview.dto';
import { UpsertPromotionDto } from './dto/upsert-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { toPromotionResponse, toActivePromotionView } from './mappers/promotion.mapper';
import { computePromotionsPreview, PreviewLine } from './promotion-engine.util';

// Só esses tipos mapeiam 1:1 para o badge Product.promotion (ver promotion.mapper.ts).
const CATALOG_PROMOTION_TYPES = ['direct_discount', 'flash_sale', 'buy_x_get_y'] as const;

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PromotionQueryDto) {
    const where: Prisma.PromotionWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.activeOnly !== false) {
      const now = new Date();
      where.isActive = true;
      where.startsAt = { lte: now };
      where.endsAt = { gte: now };
    }

    const items = await this.prisma.promotion.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return { items: items.map(toPromotionResponse) };
  }

  async getBySlug(slug: string) {
    const promotion = await this.prisma.promotion.findUnique({ where: { slug } });
    if (!promotion) throw new NotFoundApiException('Promoção não encontrada.');
    return toPromotionResponse(promotion);
  }

  async preview(dto: PromotionPreviewDto) {
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    const lines: PreviewLine[] = dto.items.map((item) => {
      const variant = variantsById.get(item.variantId);
      if (!variant || variant.productId !== item.productId) {
        throw new NotFoundApiException('Variante não encontrada.');
      }
      return {
        productId: item.productId,
        variantId: item.variantId,
        categoryId: variant.product.categoryId,
        brandId: variant.product.brandId,
        quantity: item.quantity,
        unitPrice: effectivePrice(variant),
      };
    });

    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    });

    return computePromotionsPreview(lines, promotions);
  }

  /** Resolve, em lote, a promoção ativa de maior prioridade que toca cada produto (catálogo). */
  async resolveActiveForProducts(
    products: { id: string; categoryId: string; brandId: string }[],
  ): Promise<Map<string, ActivePromotionView>> {
    const result = new Map<string, ActivePromotionView>();
    if (!products.length) return result;

    const now = new Date();
    const productIds = products.map((p) => p.id);
    const categoryIds = [...new Set(products.map((p) => p.categoryId))];
    const brandIds = [...new Set(products.map((p) => p.brandId))];

    const promotions = await this.prisma.promotion.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        type: { in: [...CATALOG_PROMOTION_TYPES] },
        OR: [
          { productIds: { hasSome: productIds } },
          { categoryIds: { hasSome: categoryIds } },
          { brandIds: { hasSome: brandIds } },
        ],
      },
      orderBy: [{ priority: 'desc' }],
    });
    if (!promotions.length) return result;

    for (const product of products) {
      const matching = promotions.filter(
        (p) =>
          p.productIds.includes(product.id) ||
          p.categoryIds.includes(product.categoryId) ||
          p.brandIds.includes(product.brandId),
      );
      if (!matching.length) continue;
      const best = matching.reduce((a, b) => (b.priority > a.priority ? b : a));
      result.set(product.id, toActivePromotionView(best));
    }
    return result;
  }

  async adminList(pagination: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.promotion.count(),
    ]);
    return paginate(items.map(toPromotionResponse), total, pagination.page, pagination.pageSize);
  }

  async create(dto: UpsertPromotionDto) {
    const promotion = await this.prisma.promotion.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description ?? '',
        type: dto.type,
        discountPercentage: dto.discountPercentage,
        discountAmount: dto.discountAmount,
        buyXGetY: dto.buyXGetY as unknown as Prisma.InputJsonValue,
        progressiveTiers: dto.progressiveTiers as unknown as Prisma.InputJsonValue,
        kitItems: dto.kitItems as unknown as Prisma.InputJsonValue,
        kitPrice: dto.kitPrice,
        productIds: dto.productIds ?? [],
        categoryIds: dto.categoryIds ?? [],
        brandIds: dto.brandIds ?? [],
        bannerImage: dto.bannerImage,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
      },
    });
    return toPromotionResponse(promotion);
  }

  async update(id: string, dto: UpdatePromotionDto) {
    await this.findByIdOrThrow(id);
    const promotion = await this.prisma.promotion.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        discountPercentage: dto.discountPercentage,
        discountAmount: dto.discountAmount,
        buyXGetY: dto.buyXGetY as unknown as Prisma.InputJsonValue,
        progressiveTiers: dto.progressiveTiers as unknown as Prisma.InputJsonValue,
        kitItems: dto.kitItems as unknown as Prisma.InputJsonValue,
        kitPrice: dto.kitPrice,
        productIds: dto.productIds,
        categoryIds: dto.categoryIds,
        brandIds: dto.brandIds,
        bannerImage: dto.bannerImage,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive,
        priority: dto.priority,
      },
    });
    return toPromotionResponse(promotion);
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.promotion.update({ where: { id }, data: { isActive: false } });
  }

  private async findByIdOrThrow(id: string) {
    const promotion = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promotion) throw new NotFoundApiException('Promoção não encontrada.');
    return promotion;
  }
}
