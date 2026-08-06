import { Injectable } from '@nestjs/common';
import { Category as CategoryModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/dto/paginated-response.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import { UpsertCategoryDto } from './dto/upsert-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CategoryResponse,
  CategoryTreeResponse,
  toCategoryResponse,
} from './mappers/category.mapper';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CategoryQueryDto): Promise<{ items: CategoryResponse[] | CategoryTreeResponse[] }> {
    const categories = await this.prisma.category.findMany({
      where: query.includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const directCounts = await this.getDirectActiveProductCounts();
    const totalCounts = this.aggregateProductCounts(categories, directCounts);

    if (query.tree) {
      return { items: this.buildTree(categories, null, totalCounts) };
    }

    return {
      items: categories.map((category) => toCategoryResponse(category, totalCounts.get(category.id) ?? 0)),
    };
  }

  async getBySlug(slug: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category || !category.isActive) {
      throw new NotFoundApiException('Categoria não encontrada.');
    }
    const directCounts = await this.getDirectActiveProductCounts();
    const allCategories = await this.prisma.category.findMany();
    const totalCounts = this.aggregateProductCounts(allCategories, directCounts);
    return toCategoryResponse(category, totalCounts.get(category.id) ?? 0);
  }

  async adminList(pagination: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.category.count(),
    ]);
    return paginate(
      items.map((c) => toCategoryResponse(c)),
      total,
      pagination.page,
      pagination.pageSize,
    );
  }

  async create(dto: UpsertCategoryDto): Promise<CategoryResponse> {
    const category = await this.prisma.category.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description ?? '',
        image: dto.image ?? '',
        parentId: dto.parentId,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return toCategoryResponse(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    await this.findByIdOrThrow(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    return toCategoryResponse(category);
  }

  /** Soft-delete (docs/14-admin.md → preferível a hard-delete). */
  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }

  private async findByIdOrThrow(id: string): Promise<CategoryModel> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundApiException('Categoria não encontrada.');
    }
    return category;
  }

  private async getDirectActiveProductCounts(): Promise<Map<string, number>> {
    const grouped = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { isActive: true },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  }

  /** productCount = produtos diretos + de todas as subcategorias (docs/02-categorias.md). */
  private aggregateProductCounts(
    categories: CategoryModel[],
    directCounts: Map<string, number>,
  ): Map<string, number> {
    const childrenByParent = new Map<string | null, CategoryModel[]>();
    for (const category of categories) {
      const key = category.parentId;
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
    }

    const totals = new Map<string, number>();

    const computeTotal = (category: CategoryModel): number => {
      if (totals.has(category.id)) {
        return totals.get(category.id) as number;
      }
      const own = directCounts.get(category.id) ?? 0;
      const childrenTotal = (childrenByParent.get(category.id) ?? []).reduce(
        (sum, child) => sum + computeTotal(child),
        0,
      );
      const total = own + childrenTotal;
      totals.set(category.id, total);
      return total;
    };

    categories.forEach(computeTotal);
    return totals;
  }

  private buildTree(
    categories: CategoryModel[],
    parentId: string | null,
    counts: Map<string, number>,
  ): CategoryTreeResponse[] {
    return categories
      .filter((c) => c.parentId === parentId)
      .map((c) => ({
        ...toCategoryResponse(c, counts.get(c.id) ?? 0),
        children: this.buildTree(categories, c.id, counts),
      }));
  }
}
