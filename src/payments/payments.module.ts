import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments.webhook.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { AsaasPaymentGateway } from './gateways/asaas-payment.gateway';
import { paymentGatewayProvider } from './payments.gateway.provider';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [CouponsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, MockPaymentGateway, AsaasPaymentGateway, paymentGatewayProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
