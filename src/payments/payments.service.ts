import { Injectable, Logger } from '@nestjs/common';
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
import { retry } from '../common/utils/retry';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentGatewayResolver } from './gateways/payment-gateway.resolver';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { TokenizeCardDto } from './dto/tokenize-card.dto';
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
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly couponsService: CouponsService,
    private readonly gatewayResolver: PaymentGatewayResolver,
  ) {}

  async createPayment(user: AuthenticatedUser, dto: CreatePaymentDto, ip?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order || order.userId !== user.id) {
      throw new NotFoundApiException('Pedido não encontrado.');
    }

    const payment = await this.createPaymentInternal(order, { ...dto, ip });
    return toPaymentResponse(payment);
  }

  /** POST /payments/tokenize-card — gera o creditCardToken usado depois em createPayment. */
  async tokenizeCard(user: AuthenticatedUser, dto: TokenizeCardDto, ip: string) {
    const customer = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const gateway = await this.gatewayResolver.resolve();

    return gateway.tokenizeCard({
      customer: {
        externalId: customer.id,
        name: customer.name,
        email: customer.email,
        document: customer.document ?? undefined,
        phone: customer.phone ?? undefined,
      },
      card: {
        holderName: dto.holderName,
        number: dto.number,
        expiryMonth: dto.expiryMonth,
        expiryYear: dto.expiryYear,
        ccv: dto.ccv,
      },
      billingAddress: {
        postalCode: dto.postalCode,
        addressNumber: dto.addressNumber,
        addressComplement: dto.addressComplement,
      },
      remoteIp: ip,
    });
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

    const gateway = await this.gatewayResolver.resolve();
    const result = await gateway.createPayment({
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

    // A partir daqui o gateway JÁ criou a cobrança de verdade (dinheiro real em
    // produção) — falha transitória salvando localmente não pode virar "nunca
    // aconteceu". Tenta de novo antes de desistir; se mesmo assim falhar, loga
    // tudo que precisa pra reconciliar manualmente em vez de engolir o erro.
    let payment: PaymentModel;
    try {
      payment = await retry(() =>
        this.prisma.payment.create({
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
        }),
      );
      await retry(() =>
        this.prisma.order.update({
          where: { id: order.id },
          data: { paymentId: payment.id, paymentMethod: input.method },
        }),
      );
    } catch (err) {
      this.logger.error(
        `COBRANÇA CRIADA NO GATEWAY MAS NÃO SALVA LOCALMENTE — reconciliar manualmente. ` +
          `orderId=${order.id} orderNumber=${order.orderNumber} method=${input.method} ` +
          `amount=${input.amount} gatewayTransactionId=${result.transactionId ?? 'N/A'}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new ApiException(
        'Pagamento foi processado no gateway, mas houve uma falha ao registrar aqui. ' +
          'Entre em contato com o suporte informando o número do pedido antes de tentar novamente.',
        'PAYMENT_PERSIST_FAILED',
        500,
      );
    }

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
      const gateway = await this.gatewayResolver.resolve();
      await gateway.cancelPayment(payment.transactionId);
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      }),
      // Mesmo motivo do `cancelPendingPaymentForOrder`: sem isso, `Order.paymentStatus`
      // (snapshot desnormalizado) fica desatualizado em relação ao `Payment.status` real.
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'cancelled' },
      }),
    ]);
    return toPaymentResponse(updated);
  }

  /**
   * Usado pelo `OrdersService` ao cancelar um pedido — sem isso, cancelar um
   * pedido aqui não avisava a Asaas, e um PIX/boleto pendente continuava
   * pagável do lado deles até vencer sozinho. Best-effort: se o gateway
   * recusar (já pago, já vencido, etc.), loga e segue — cancelar o pedido não
   * pode ficar refém do cancelamento no gateway ter dado certo.
   */
  async cancelPendingPaymentForOrder(orderId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) return;

    // Só marcamos como cancelado localmente se o gateway confirmar — senão o banco
    // afirma "cancelado" pro admin enquanto a cobrança real continua aberta (ou já
    // paga) na Asaas, e ninguém fica sabendo que precisa cancelar na mão lá.
    if (payment.transactionId) {
      try {
        const gateway = await this.gatewayResolver.resolve();
        await gateway.cancelPayment(payment.transactionId);
      } catch (err) {
        this.logger.error(
          `CANCELAMENTO NO GATEWAY FALHOU — cobrança continua aberta na Asaas, reconciliar ` +
            `manualmente. orderId=${orderId} paymentId=${payment.id} transactionId=${payment.transactionId}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      }),
      // `Order.paymentStatus` é um snapshot desnormalizado — sem isso, o pedido
      // fica com status "cancelled" mas paymentStatus ainda "pending".
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'cancelled' },
      }),
    ]);
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
      const gateway = await this.gatewayResolver.resolve();
      await gateway.refundPayment(payment.transactionId, requested);
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

    const gateway = await this.gatewayResolver.resolve();
    const parsed = gateway.parseWebhookEvent(rawBody);
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
