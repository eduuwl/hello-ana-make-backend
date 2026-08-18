import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'in_transit',
  'delivered',
  'cancelled',
  'refunded',
  'returned',
];

// "Pedidos paid+" (14-admin.md → dashboard): status que indicam pagamento confirmado em diante.
const PAID_PLUS_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'in_transit', 'delivered'];

const LOW_STOCK_THRESHOLD = 5;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: DashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { status: true, total: true },
    });

    const ordersByStatus = ALL_STATUSES.reduce<Record<string, number>>((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});
    for (const order of orders) {
      ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;
    }

    const paidOrders = orders.filter((o) => PAID_PLUS_STATUSES.includes(o.status));
    const revenue = round2(paidOrders.reduce((sum, o) => sum + toNumber(o.total), 0));
    const ordersPaidCount = paidOrders.length;
    const averageTicket = ordersPaidCount ? round2(revenue / ordersPaidCount) : 0;

    const [newCustomers, productsLowStock, topProductsRaw] = await Promise.all([
      this.prisma.user.count({ where: { role: 'customer', createdAt: { gte: from, lte: to } } }),
      this.prisma.product.count({
        where: { isActive: true, totalStock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: { createdAt: { gte: from, lte: to }, status: { in: PAID_PLUS_STATUSES } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      period: { from: toDateOnly(from), to: toDateOnly(to) },
      ordersCount: orders.length,
      ordersPaidCount,
      revenue,
      averageTicket,
      newCustomers,
      productsLowStock,
      ordersByStatus,
      topProducts: topProductsRaw.map((r) => ({
        productId: r.productId,
        name: r.productName,
        unitsSold: r._sum.quantity ?? 0,
      })),
    };
  }
}
