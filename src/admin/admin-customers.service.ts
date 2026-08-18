import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { paginate } from '../common/dto/paginated-response.dto';
import { toPublicUser } from '../auth/mappers/user.mapper';
import { CustomersQueryDto } from './dto/customers-query.dto';

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomersQueryDto) {
    const where: Prisma.UserWhereInput = { role: 'customer' };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rows.map((row) => ({ ...toPublicUser(row), ordersCount: row._count.orders }));
    return paginate(items, total, query.page, query.pageSize);
  }

  async getById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'customer' },
      include: { _count: { select: { orders: true } } },
    });
    if (!user) throw new NotFoundApiException('Cliente não encontrado.');
    return { ...toPublicUser(user), ordersCount: user._count.orders };
  }
}
