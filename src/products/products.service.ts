import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException, ValidationApiException } from '../common/exceptions/common.exceptions';
import { paginate } from '../common/dto/paginated-response.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductVariantInputDto } from './dto/product-variant-input.dto';
import { toProductResponse, ProductWithRelations } from './mappers/product.mapper';

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  images: true,
  variants: true,
  badges: true,
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQueryDto, { allowInactive = false } = {}) {
    const where = await this.buildWhere(query, allowInactive);
    const orderBy = this.buildOrderBy(query.sortBy);

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        include: PRODUCT_INCLUDE,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const items = rows.map((row) => toProductResponse(row as ProductWithRelations));
    return paginate(items, total, query.page, query.pageSize);
  }

  async getBySlug(slug: string, { allowInactive = false } = {}) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: PRODUCT_INCLUDE,
    });
    if (!product || (!allowInactive && !product.isActive)) {
      throw new NotFoundApiException('Produto não encontrado.');
    }
    return toProductResponse(product as ProductWithRelations);
  }

  async getRelated(id: string, limit = 8) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundApiException('Produto não encontrado.');
    }

    const related = await this.prisma.product.findMany({
      where: {
        id: { not: id },
        isActive: true,
        OR: [{ categoryId: product.categoryId }, { brandId: product.brandId }],
      },
      orderBy: [{ totalStock: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: PRODUCT_INCLUDE,
    });

    return { items: related.map((row) => toProductResponse(row as ProductWithRelations)) };
  }

  async create(dto: CreateProductDto) {
    await this.assertBrandAndCategoryExist(dto.brandId, dto.categoryId);
    const aggregates = this.computeAggregates(dto.variants);

    const product = await this.prisma.product.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        shortDescription: dto.shortDescription ?? '',
        description: dto.description ?? '',
        ingredients: dto.ingredients,
        howToUse: dto.howToUse,
        benefits: dto.benefits ?? [],
        technicalInfo: dto.technicalInfo,
        brandId: dto.brandId,
        categoryId: dto.categoryId,
        isFeatured: dto.isFeatured ?? false,
        isNew: dto.isNew ?? false,
        isBestseller: dto.isBestseller ?? false,
        isActive: dto.isActive ?? true,
        ...aggregates,
        images: dto.images?.length
          ? { create: dto.images.map((img) => ({ ...img, alt: img.alt ?? '' })) }
          : undefined,
        variants: { create: dto.variants.map((v) => this.toVariantCreateInput(v)) },
        badges: dto.badges?.length ? { create: dto.badges } : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    return toProductResponse(product as ProductWithRelations);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findByIdOrThrow(id);
    if (dto.brandId || dto.categoryId) {
      await this.assertBrandAndCategoryExist(dto.brandId, dto.categoryId);
    }

    const aggregates = dto.variants ? this.computeAggregates(dto.variants) : {};

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        shortDescription: dto.shortDescription,
        description: dto.description,
        ingredients: dto.ingredients,
        howToUse: dto.howToUse,
        benefits: dto.benefits,
        technicalInfo: dto.technicalInfo,
        brandId: dto.brandId,
        categoryId: dto.categoryId,
        isFeatured: dto.isFeatured,
        isNew: dto.isNew,
        isBestseller: dto.isBestseller,
        isActive: dto.isActive,
        ...aggregates,
        images: dto.images
          ? { deleteMany: {}, create: dto.images.map((img) => ({ ...img, alt: img.alt ?? '' })) }
          : undefined,
        variants: dto.variants
          ? { deleteMany: {}, create: dto.variants.map((v) => this.toVariantCreateInput(v)) }
          : undefined,
        badges: dto.badges ? { deleteMany: {}, create: dto.badges } : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    return toProductResponse(product as ProductWithRelations);
  }

  /** Soft-delete (docs/14-admin.md → preferível a hard-delete). */
  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  private async findByIdOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundApiException('Produto não encontrado.');
    }
    return product;
  }

  private async assertBrandAndCategoryExist(brandId?: string, categoryId?: string) {
    if (brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) throw new NotFoundApiException('Marca não encontrada.');
    }
    if (categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundApiException('Categoria não encontrada.');
    }
  }

  private toVariantCreateInput(v: ProductVariantInputDto) {
    return {
      sku: v.sku,
      name: v.name,
      attributes: (v.attributes ?? {}) as Prisma.InputJsonValue,
      price: v.price,
      promotionalPrice: v.promotionalPrice,
      stock: v.stock,
      image: v.image,
      isAvailable: v.isAvailable ?? true,
    };
  }

  /** docs/01-produtos.md → pricing/inventory agregados a partir das variantes. */
  private computeAggregates(variants: ProductVariantInputDto[]) {
    if (!variants.length) {
      throw new ValidationApiException({
        variants: ['O produto precisa de ao menos uma variante.'],
      });
    }

    const effectivePrices = variants.map((v) => v.promotionalPrice ?? v.price);
    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
    const hasPromotion = variants.some((v) => v.promotionalPrice !== undefined);

    return {
      totalStock,
      minEffectivePrice: Math.min(...effectivePrices),
      maxEffectivePrice: Math.max(...effectivePrices),
      hasPromotion,
    };
  }

  private async buildWhere(
    query: ProductQueryDto,
    allowInactive: boolean,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {};

    if (!allowInactive || !query.includeInactive) {
      where.isActive = true;
    }

    if (query.categoryIds?.length) {
      where.categoryId = { in: await this.expandCategoryIds(query.categoryIds) };
    }

    if (query.brandIds?.length) {
      where.brandId = { in: query.brandIds };
    }

    if (query.isFeatured) where.isFeatured = true;
    if (query.isNew) where.isNew = true;
    if (query.isBestseller) where.isBestseller = true;
    if (query.onSale) where.hasPromotion = true;
    if (query.inStockOnly) where.totalStock = { gt: 0 };
    if (query.ratingMin !== undefined) where.ratingAverage = { gte: query.ratingMin };

    if (query.priceMin !== undefined) {
      where.maxEffectivePrice = { gte: query.priceMin };
    }
    if (query.priceMax !== undefined) {
      where.minEffectivePrice = { lte: query.priceMax };
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { shortDescription: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.colors?.length) {
      where.variants = {
        some: {
          OR: query.colors.map((color) => ({
            attributes: { path: ['color'], equals: color },
          })),
        },
      };
    }

    return where;
  }

  private buildOrderBy(sortBy: ProductQueryDto['sortBy']): Prisma.ProductOrderByWithRelationInput[] {
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

  private async expandCategoryIds(ids: string[]): Promise<string[]> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const childrenByParent = new Map<string, string[]>();
    for (const c of all) {
      if (!c.parentId) continue;
      childrenByParent.set(c.parentId, [...(childrenByParent.get(c.parentId) ?? []), c.id]);
    }

    const result = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      const current = stack.pop() as string;
      if (result.has(current)) continue;
      result.add(current);
      stack.push(...(childrenByParent.get(current) ?? []));
    }
    return [...result];
  }
}
