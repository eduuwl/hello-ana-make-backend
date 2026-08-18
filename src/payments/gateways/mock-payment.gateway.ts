import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentStatus } from '@prisma/client';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  CreatePaymentGatewayInput,
  CreatePaymentGatewayResult,
  ParsedWebhookEvent,
  PaymentGateway,
} from './payment-gateway.interface';

const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'processing',
  'authorized',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
];

const DEFAULT_PIX_EXPIRES_SECONDS = 30 * 60;

/**
 * Simula um gateway real (Asaas/Mercado Pago/Stripe) para dev/testes sem credenciais
 * (docs/10-pagamentos.md → MVP: Pix, credit_card, boleto). Trocar por uma implementação
 * real é só criar outra classe que satisfaça `PaymentGateway`.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  async createPayment(input: CreatePaymentGatewayInput): Promise<CreatePaymentGatewayResult> {
    const transactionId = `mock_${input.method}_${randomUUID()}`;

    switch (input.method) {
      case 'pix': {
        const expiresInSeconds = input.pix?.expiresInSeconds ?? DEFAULT_PIX_EXPIRES_SECONDS;
        return {
          status: 'pending',
          transactionId,
          pixQrCode: `00020126580014br.gov.bcb.pix0136${transactionId}5204000053039865802BR5913HELLO ANA MAKE6009SAO PAULO`,
          pixQrCodeUrl: `https://mock-gateway.local/pix/${transactionId}/qr.png`,
          pixExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        };
      }

      case 'credit_card': {
        // Token de teste "tok_..._fail" simula recusa, sem depender de um gateway real.
        if (input.card?.token?.includes('fail')) {
          return {
            status: 'failed',
            transactionId,
            failureReason: 'Cartão recusado pela operadora.',
          };
        }
        return { status: 'paid', transactionId };
      }

      case 'boleto': {
        return {
          status: 'pending',
          transactionId,
          boletoBarcode: `34191${transactionId.replace(/\D/g, '').padEnd(39, '0').slice(0, 39)}`,
          boletoUrl: `https://mock-gateway.local/boleto/${transactionId}.pdf`,
        };
      }

      default:
        throw new ApiException(
          `Método de pagamento "${input.method}" não é suportado ainda.`,
          'PAYMENT_METHOD_NOT_SUPPORTED',
          422,
        );
    }
  }

  async refundPayment(_transactionId: string, _amount: number): Promise<void> {
    // Mock: nada a fazer no gateway.
  }

  async cancelPayment(_transactionId: string): Promise<void> {
    // Mock: nada a fazer no gateway.
  }

  /** Webhook do mock é o próprio shape interno — sem tradução de evento de provedor real. */
  parseWebhookEvent(rawBody: unknown): ParsedWebhookEvent | null {
    const body = rawBody as { transactionId?: string; status?: string };
    if (!body.transactionId || !body.status || !PAYMENT_STATUSES.includes(body.status as PaymentStatus)) {
      return null;
    }
    return { transactionId: body.transactionId, status: body.status as PaymentStatus };
  }
}
