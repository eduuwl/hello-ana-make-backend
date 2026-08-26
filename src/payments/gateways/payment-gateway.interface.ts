import { PaymentMethod, PaymentStatus } from '@prisma/client';

export interface GatewayCustomerInput {
  externalId: string;
  name: string;
  email: string;
  document?: string;
  phone?: string;
}

export interface CreatePaymentGatewayInput {
  orderId: string;
  method: PaymentMethod;
  amount: number;
  currency: string;
  customer: GatewayCustomerInput;
  card?: {
    token: string;
    installments: number;
    holderName: string;
    brand?: string;
    lastFourDigits?: string;
  };
  pix?: {
    expiresInSeconds?: number;
  };
  returnUrl?: string;
  metadata?: Record<string, string>;
  /** IP do cliente — obrigatório pra antifraude de cartão em gateways reais (ex.: Asaas). */
  ip?: string;
}

export interface CreatePaymentGatewayResult {
  status: 'pending' | 'processing' | 'authorized' | 'paid' | 'failed';
  transactionId: string;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
  pixExpiresAt?: Date;
  boletoUrl?: string;
  boletoBarcode?: string;
  redirectUrl?: string;
  failureReason?: string;
}

export interface ParsedWebhookEvent {
  transactionId: string;
  status: PaymentStatus;
}

export interface TokenizeCardInput {
  customer: GatewayCustomerInput;
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  billingAddress: {
    postalCode: string;
    addressNumber: string;
    addressComplement?: string;
  };
  /** IP do cliente — exigido pelo Asaas na tokenização (antifraude). */
  remoteIp: string;
}

export interface TokenizeCardResult {
  token: string;
  brand?: string;
  lastFourDigits?: string;
}

/**
 * Interface agnóstica de provedor (docs/10-pagamentos.md → "Gateway-agnostic").
 * Trocar de mock para Asaas/Mercado Pago/Stripe é só implementar esta interface
 * e registrar em `payment-gateway.resolver.ts` — o resto do domínio não muda.
 *
 * `refundPayment`/`cancelPayment` só executam a ação no gateway — quem decide se o
 * reembolso é total ou parcial e atualiza o `Payment`/`Order` é o `PaymentsService`.
 */
export interface PaymentGateway {
  createPayment(input: CreatePaymentGatewayInput): Promise<CreatePaymentGatewayResult>;
  refundPayment(transactionId: string, amount: number): Promise<void>;
  cancelPayment(transactionId: string): Promise<void>;
  /**
   * Normaliza o payload cru do webhook do provedor para `{ transactionId, status }`.
   * Retorna `null` para eventos que não mudam o estado do pagamento (ignorados,
   * mas ainda respondidos com 200 pelo `PaymentsService` — docs/10-pagamentos.md).
   */
  parseWebhookEvent(rawBody: unknown): ParsedWebhookEvent | null;
  /**
   * Tokeniza os dados do cartão pra gerar o `creditCardToken` usado depois em
   * `createPayment`. O Asaas não tem SDK client-side (sem chave pública/publishable
   * key) — a tokenização só é possível autenticada com a `access_token` secreta,
   * então acontece aqui no backend, nunca no navegador.
   */
  tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult>;
}
