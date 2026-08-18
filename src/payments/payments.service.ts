import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order as OrderModel, Payment as PaymentModel, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundApiException,
  UnauthenticatedApiException,
  ValidationApiException,
} from '../common/exceptions/common.exceptions';
import { ApiException } from '../common/exceptions/api.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CouponsService } from '../coupons/coupons.service';
import { PAYMENT_GATEWAY, PaymentGateway } from './gateways/payment-gateway.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { toPaymentResponse } from './mappers/payment.mapper';

const AMOUNT_TOLERANCE = 0.01;

export interface CreatePaymentInternalInput {
  method: PaymentMethod;
  amount: number;
  currency: string;
  card?: CreatePaymentDto['card'];
  pix?: CreatePaymentDto['pix'];
  returnUrl?: string;
  metadata?: Record<string, string>;
  ip?: string;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly couponsService: CouponsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async createPayment(user: AuthenticatedUser, dto: CreatePaymentDto, ip?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order || order.userId !== user.id) {
      throw new NotFoundApiException('Pedido não encontrado.');
    }

    const payment = await this.createPaymentInternal(order, { ...dto, ip });
    return toPaymentResponse(payment);
  }

  /** Usado pelo `OrdersService` para abrir a cobrança inicial ao criar o pedido. */
  async createPaymentInternal(order: OrderModel, input: CreatePaymentInternalInput): Promise<PaymentModel> {
    if (Math.abs(input.amount - toNumber(order.total)) > AMOUNT_TOLERANCE) {
      throw new ApiException('Valor diverge do total do pedido.', 'PAYMENT_AMOUNT_MISMATCH', 422);
    }

    const existingPending = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      return existingPending;
    }

    const customer = await this.prisma.user.findUniqueOrThrow({ where: { id: order.userId } });

    const result = await this.gateway.createPayment({
      orderId: order.id,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      card: input.card,
      pix: input.pix,
      returnUrl: input.returnUrl,
      metadata: input.metadata,
      ip: input.ip,
      customer: {
        externalId: customer.id,
        name: customer.name,
        email: customer.email,
        document: customer.document ?? undefined,
        phone: customer.phone ?? undefined,
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: input.method,
        status: result.status,
        amount: input.amount,
        currency: input.currency,
        pixQrCode: result.pixQrCode,
        pixQrCodeUrl: result.pixQrCodeUrl,
        pixExpiresAt: result.pixExpiresAt,
        boletoUrl: result.boletoUrl,
        boletoBarcode: result.boletoBarcode,
        redirectUrl: result.redirectUrl,
        transactionId: result.transactionId,
        cardBrand: input.card?.brand,
        cardLastFourDigits: input.card?.lastFourDigits,
        installments: input.card?.installments,
        failureReason: result.failureReason,
        metadata: input.metadata,
      },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payment.id, paymentMethod: input.method },
    });

    if (result.status === 'paid') {
      return this.markOrderPaid(payment);
    }
    if (result.status === 'failed') {
      return this.markOrderPaymentFailed(payment, result.failureReason);
    }
    return payment;
  }

  async getById(user: AuthenticatedUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment || (user.role !== 'admin' && payment.order.userId !== user.id)) {
      throw new NotFoundApiException('Pagamento não encontrado.');
    }
    return toPaymentResponse(payment);
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment || (user.role !== 'admin' && payment.order.userId !== user.id)) {
      throw new NotFoundApiException('Pagamento não encontrado.');
    }
    if (payment.status !== 'pending') {
      throw new ApiException('Este pagamento não pode ser cancelado.', 'PAYMENT_NOT_CANCELLABLE', 422);
    }

    if (payment.transactionId) {
      await this.gateway.cancelPayment(payment.transactionId);
    }
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    return toPaymentResponse(updated);
  }

  async refund(id: string, amount?: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundApiException('Pagamento não encontrado.');
    }
    if (payment.status !== 'paid' && payment.status !== 'partially_refunded') {
      throw new ApiException('Este pagamento não pode ser reembolsado.', 'PAYMENT_NOT_REFUNDABLE', 422);
    }

    const total = toNumber(payment.amount);
    const alreadyRefunded = toNumber(payment.refundedAmount);
    const requested = amount ?? total - alreadyRefunded;

    if (requested <= 0 || alreadyRefunded + requested > total + AMOUNT_TOLERANCE) {
      throw new ValidationApiException({ amount: ['Valor de reembolso inválido.'] });
    }

    if (payment.transactionId) {
      await this.gateway.refundPayment(payment.transactionId, requested);
    }

    const newRefundedAmount = Math.min(total, alreadyRefunded + requested);
    const isFullRefund = total - newRefundedAmount <= AMOUNT_TOLERANCE;

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: isFullRefund ? 'refunded' : 'partially_refunded',
        refundedAmount: newRefundedAmount,
        refundedAt: new Date(),
      },
    });

    if (isFullRefund) {
      await this.prisma.order.update({ where: { id: payment.orderId }, data: { status: 'refunded' } });
    }

    return toPaymentResponse(updated);
  }

  /** Descobre o pagamento ativo do pedido para o refund disparado por `admin/orders/:id/refund`. */
  async refundLatestForOrder(orderId: string, amount?: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: ['paid', 'partially_refunded'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      throw new NotFoundApiException('Nenhum pagamento reembolsável encontrado para este pedido.');
    }
    return this.refund(payment.id, amount);
  }

  /**
   * `POST /webhooks/payments/{gateway}` — autenticado por segredo compartilhado, não JWT
   * (docs/10-pagamentos.md). No Asaas isso é literalmente como funciona: o token configurado
   * no painel volta no header `asaas-access-token` em toda notificação — não é um placeholder,
   * é o mecanismo real de autenticação do provedor.
   */
  async handleWebhook(secretHeader: string | undefined, rawBody: unknown) {
    const expectedSecret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    if (!expectedSecret || secretHeader !== expectedSecret) {
      throw new UnauthenticatedApiException('Assinatura de webhook inválida.');
    }

    const parsed = this.gateway.parseWebhookEvent(rawBody);
    if (!parsed) {
      // Evento não mapeado ou payload desconhecido — 200 evita retry infinito no gateway.
      return { received: true };
    }

    const payment = await this.prisma.payment.findUnique({ where: { transactionId: parsed.transactionId } });
    if (!payment || payment.status === parsed.status) {
      return { received: true };
    }

    if (parsed.status === 'paid') {
      await this.markOrderPaid(payment);
    } else if (parsed.status === 'failed') {
      await this.markOrderPaymentFailed(payment);
    } else {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: parsed.status } });
    }

    return { received: true };
  }

  private async markOrderPaid(payment: PaymentModel): Promise<PaymentModel> {
    const now = new Date();
    const [updatedPayment, order] = await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'paid', paidAt: now } }),
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'paid', status: 'paid', paidAt: now },
      }),
    ]);

    if (order.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({ where: { code: order.couponCode } });
      if (coupon) {
        await this.couponsService.consume(coupon.id, order.userId, order.id);
      }
    }

    return updatedPayment;
  }

  private async markOrderPaymentFailed(payment: PaymentModel, failureReason?: string): Promise<PaymentModel> {
    const [updatedPayment] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failedAt: new Date(), failureReason },
      }),
      this.prisma.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'failed' } }),
    ]);
    return updatedPayment;
  }
}
