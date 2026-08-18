import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments.webhook.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { AsaasPaymentGateway } from './gateways/asaas-payment.gateway';
import { PaymentGatewayResolver } from './gateways/payment-gateway.resolver';
import { CouponsModule } from '../coupons/coupons.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [CouponsModule, SettingsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, MockPaymentGateway, AsaasPaymentGateway, PaymentGatewayResolver],
  exports: [PaymentsService],
})
export class PaymentsModule {}
