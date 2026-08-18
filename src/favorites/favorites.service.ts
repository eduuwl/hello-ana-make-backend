import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { paginate } from '../common/dto/paginated-response.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PRODUCT_INCLUDE, ProductWithRelations, toProductResponse } from '../products/mappers/product.mapper';
import { buildProductOrderBy } from '../products/product-sort.util';
import { FavoritesQueryDto } from './dto/favorites-query.dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, query: FavoritesQueryDto) {
    const where = { userId: user.id, product: { isActive: true } };
    const orderBy = buildProductOrderBy(query.sortBy).map((clause) => ({ product: clause }));

    const [favorites, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        include: { product: { include: PRODUCT_INCLUDE } },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.favorite.count({ where }),
    ]);

    const items = favorites.map((f) => toProductResponse(f.product as ProductWithRelations, true));
    return paginate(items, total, query.page, query.pageSize);
  }

  async getIds(userId: string): Promise<string[]> {
    const favorites = await this.prisma.favorite.findMany({ where: { userId }, select: { productId: true } });
    return favorites.map((f) => f.productId);
  }

  async has(userId: string, productId: string): Promise<boolean> {
    const favorite = await this.prisma.favorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    return favorite !== null;
  }

  async add(userId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundApiException('Produto não encontrado.');

    await this.prisma.favorite.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, productId } });
  }
}
