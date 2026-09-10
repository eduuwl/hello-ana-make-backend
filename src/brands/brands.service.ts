import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictApiException,
  NotFoundApiException,
} from '../common/exceptions/common.exceptions';
import { ApiException } from '../common/exceptions/api.exception';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/dto/paginated-response.dto';
import { UpsertBrandDto } from './dto/upsert-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { toBrandResponse } from './mappers/brand.mapper';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive = false) {
    const brands = await this.prisma.brand.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
    return { items: brands.map(toBrandResponse) };
  }

  async getBySlug(slug: string) {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand || !brand.isActive) {
      throw new NotFoundApiException('Marca não encontrada.');
    }
    return toBrandResponse(brand);
  }

  async adminList(pagination: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.brand.findMany({
        orderBy: { name: 'asc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.brand.count(),
    ]);
    return paginate(items.map(toBrandResponse), total, pagination.page, pagination.pageSize);
  }

  async create(dto: UpsertBrandDto) {
    const data = {
      slug: dto.slug,
      name: dto.name,
      description: dto.description,
      logo: dto.logo,
      website: dto.website,
      isActive: dto.isActive ?? true,
    };

    // `slug` é @unique e o "excluir" é soft-delete (isActive=false) — o slug fica
    // reservado. Se já existe uma marca inativa com esse slug, "recriar" reativa e
    // sobrescreve os dados em vez de estourar um 409 sem saída pro admin.
    const existing = await this.prisma.brand.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      if (existing.isActive) {
        throw new ConflictApiException('Já existe uma marca com esse slug.', 'BRAND_SLUG_TAKEN');
      }
      const revived = await this.prisma.brand.update({ where: { id: existing.id }, data });
      return toBrandResponse(revived);
    }

    const brand = await this.prisma.brand.create({ data });
    return toBrandResponse(brand);
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.findByIdOrThrow(id);
    const brand = await this.prisma.brand.update({ where: { id }, data: dto });
    return toBrandResponse(brand);
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    const productsCount = await this.prisma.product.count({ where: { brandId: id } });
    if (productsCount > 0) {
      throw new ApiException(
        'Não é possível excluir uma marca com produtos associados.',
        'BRAND_HAS_PRODUCTS',
        409,
      );
    }
    await this.prisma.brand.update({ where: { id }, data: { isActive: false } });
  }

  private async findByIdOrThrow(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      throw new NotFoundApiException('Marca não encontrada.');
    }
    return brand;
  }
}
