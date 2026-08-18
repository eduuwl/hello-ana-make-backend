import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  CreatePaymentGatewayInput,
  CreatePaymentGatewayResult,
  GatewayCustomerInput,
  ParsedWebhookEvent,
  PaymentGateway,
} from './payment-gateway.interface';

interface AsaasCustomer {
  id: string;
}

interface AsaasPayment {
  id: string;
  status: string;
  bankSlipUrl?: string;
}

interface AsaasPixQrCode {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}

interface AsaasErrorBody {
  errors?: Array<{ code?: string; description?: string }>;
}

// docs/10-pagamentos.md → eventos de webhook que de fato mudam o estado do pagamento.
// Eventos fora desse mapa são ignorados (mas ainda respondidos com 200, ver PaymentsService).
const ASAAS_EVENT_TO_STATUS: Partial<Record<string, PaymentStatus>> = {
  PAYMENT_CONFIRMED: 'paid',
  PAYMENT_RECEIVED: 'paid',
  PAYMENT_RECEIVED_IN_CASH: 'paid',
  PAYMENT_OVERDUE: 'failed',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'failed',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'failed',
  PAYMENT_DELETED: 'cancelled',
  PAYMENT_BANK_SLIP_CANCELLED: 'cancelled',
  PAYMENT_REFUNDED: 'refunded',
  PAYMENT_PARTIALLY_REFUNDED: 'partially_refunded',
};

/**
 * Implementação real de `PaymentGateway` para o Asaas (https://docs.asaas.com).
 * Autenticação de saída: header `access_token` (não Bearer). Cartão sempre via
 * `creditCardToken` — o PAN nunca passa por este backend, é tokenizado no frontend
 * com o Asaas.js (docs/10-pagamentos.md → "nunca receber PAN completo").
 */
@Injectable()
export class AsaasPaymentGateway implements PaymentGateway {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async createPayment(input: CreatePaymentGatewayInput): Promise<CreatePaymentGatewayResult> {
    const customerId = await this.ensureCustomerId(input.customer);
    const today = this.formatDate(new Date());

    switch (input.method) {
      case 'pix': {
        const payment = await this.request<AsaasPayment>('POST', '/payments', {
          customer: customerId,
          billingType: 'PIX',
          value: input.amount,
          dueDate: today,
          externalReference: input.orderId,
        });
        const qr = await this.request<AsaasPixQrCode>('GET', `/payments/${payment.id}/pixQrCode`);
        return {
          status: this.mapCreationStatus(payment.status),
          transactionId: payment.id,
          pixQrCode: qr.payload,
          pixQrCodeUrl: qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : undefined,
          pixExpiresAt: qr.expirationDate ? new Date(qr.expirationDate) : undefined,
        };
      }

      case 'boleto': {
        const payment = await this.request<AsaasPayment>('POST', '/payments', {
          customer: customerId,
          billingType: 'BOLETO',
          value: input.amount,
          dueDate: this.formatDate(this.addDays(new Date(), 3)),
          externalReference: input.orderId,
        });
        return {
          status: this.mapCreationStatus(payment.status),
          transactionId: payment.id,
          boletoUrl: payment.bankSlipUrl,
        };
      }

      case 'credit_card': {
        if (!input.card?.token) {
          throw new ApiException('Token de cartão obrigatório.', 'PAYMENT_CARD_TOKEN_REQUIRED', 422);
        }
        const payment = await this.request<AsaasPayment>('POST', '/payments', {
          customer: customerId,
          billingType: 'CREDIT_CARD',
          value: input.amount,
          dueDate: today,
          creditCardToken: input.card.token,
          remoteIp: input.ip ?? '0.0.0.0',
          externalReference: input.orderId,
        });
        return { status: this.mapCreationStatus(payment.status), transactionId: payment.id };
      }

      default:
        throw new ApiException(
          `Método "${input.method}" não é suportado pela integração com o Asaas.`,
          'PAYMENT_METHOD_NOT_SUPPORTED',
          422,
        );
    }
  }

  async refundPayment(transactionId: string, amount: number): Promise<void> {
    await this.request('POST', `/payments/${transactionId}/refund`, { value: amount });
  }

  async cancelPayment(transactionId: string): Promise<void> {
    await this.request('DELETE', `/payments/${transactionId}`);
  }

  parseWebhookEvent(rawBody: unknown): ParsedWebhookEvent | null {
    const body = rawBody as { event?: string; payment?: { id?: string } };
    const transactionId = body.payment?.id;
    const status = body.event ? ASAAS_EVENT_TO_STATUS[body.event] : undefined;
    if (!transactionId || !status) return null;
    return { transactionId, status };
  }

  private async ensureCustomerId(customer: GatewayCustomerInput): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: customer.externalId } });
    if (user?.asaasCustomerId) {
      return user.asaasCustomerId;
    }

    if (!customer.document) {
      throw new ApiException(
        'CPF/CNPJ é obrigatório para pagar com este método.',
        'CUSTOMER_DOCUMENT_REQUIRED',
        422,
      );
    }

    const created = await this.request<AsaasCustomer>('POST', '/customers', {
      name: customer.name,
      cpfCnpj: customer.document.replace(/\D/g, ''),
      email: customer.email,
      mobilePhone: customer.phone?.replace(/\D/g, '') || undefined,
      externalReference: customer.externalId,
    });

    await this.prisma.user.update({
      where: { id: customer.externalId },
      data: { asaasCustomerId: created.id },
    });

    return created.id;
  }

  private mapCreationStatus(status: string): CreatePaymentGatewayResult['status'] {
    if (status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH') {
      return 'paid';
    }
    if (status === 'PENDING') return 'pending';
    return 'failed';
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { integrations } = await this.settingsService.getInternal();
    const apiKey = integrations.asaasApiKey;
    if (!apiKey) {
      throw new ApiException(
        'Gateway Asaas selecionado mas asaasApiKey não configurada (PATCH /admin/settings/integrations).',
        'PAYMENT_GATEWAY_NOT_CONFIGURED',
        500,
      );
    }
    const baseUrl = this.config.get('ASAAS_API_URL', 'https://api-sandbox.asaas.com/v3');

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
        'User-Agent': 'hello-ana-make-backend',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json().catch(() => undefined)) as (T & AsaasErrorBody) | undefined;

    if (!response.ok) {
      const message = data?.errors?.[0]?.description ?? 'Falha ao comunicar com o gateway de pagamento.';
      throw new ApiException(message, 'PAYMENT_FAILED', 422);
    }

    return data as T;
  }
}
