import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { AsaasPaymentGateway } from './gateways/asaas-payment.gateway';

/**
 * Seleciona a implementação de `PaymentGateway` por `PAYMENT_GATEWAY` (settings, docs/10-pagamentos.md).
 * `mercadopago`/`stripe` são reservados para quando houver credenciais reais; até lá caem em
 * mock em vez de quebrar o boot da API.
 */
export const paymentGatewayProvider: Provider = {
  provide: PAYMENT_GATEWAY,
  useFactory: (config: ConfigService, mockGateway: MockPaymentGateway, asaasGateway: AsaasPaymentGateway) => {
    const gateway = config.get('PAYMENT_GATEWAY', 'mock');
    switch (gateway) {
      case 'asaas':
        return asaasGateway;
      case 'mock':
      default:
        return mockGateway;
    }
  },
  inject: [ConfigService, MockPaymentGateway, AsaasPaymentGateway],
};
