import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { MockPaymentGateway } from './mock-payment.gateway';
import { AsaasPaymentGateway } from './asaas-payment.gateway';
import { PaymentGateway } from './payment-gateway.interface';

/**
 * Escolhe o gateway ativo em runtime a partir de StoreSettings.integrations.paymentGateway
 * (docs/15-configuracoes.md → editável pelo admin sem redeploy). Substitui o antigo provider
 * baseado em `PAYMENT_GATEWAY` (env), que só era lido uma vez no boot da aplicação.
 */
@Injectable()
export class PaymentGatewayResolver {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mockGateway: MockPaymentGateway,
    private readonly asaasGateway: AsaasPaymentGateway,
  ) {}

  async resolve(): Promise<PaymentGateway> {
    const { integrations } = await this.settingsService.getInternal();
    return integrations.paymentGateway === 'asaas' ? this.asaasGateway : this.mockGateway;
  }
}
