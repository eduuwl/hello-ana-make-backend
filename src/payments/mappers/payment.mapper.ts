import { Payment as PaymentModel, Prisma } from '@prisma/client';

function toNumber(value: Prisma.Decimal | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  method: PaymentModel['method'];
  status: PaymentModel['status'];
  amount: number;
  currency: string;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
  pixExpiresAt?: string;
  boletoUrl?: string;
  boletoBarcode?: string;
  redirectUrl?: string;
  transactionId?: string;
  refundedAmount?: number;
  createdAt: string;
}

export function toPaymentResponse(payment: PaymentModel): PaymentResponse {
  return {
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    status: payment.status,
    amount: toNumber(payment.amount) ?? 0,
    currency: payment.currency,
    pixQrCode: payment.pixQrCode ?? undefined,
    pixQrCodeUrl: payment.pixQrCodeUrl ?? undefined,
    pixExpiresAt: payment.pixExpiresAt?.toISOString(),
    boletoUrl: payment.boletoUrl ?? undefined,
    boletoBarcode: payment.boletoBarcode ?? undefined,
    redirectUrl: payment.redirectUrl ?? undefined,
    transactionId: payment.transactionId ?? undefined,
    refundedAmount: toNumber(payment.refundedAmount),
    createdAt: payment.createdAt.toISOString(),
  };
}
