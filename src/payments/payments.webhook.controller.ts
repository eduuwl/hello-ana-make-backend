import { Body, Controller, HttpCode, HttpStatus, Param, Post, Headers } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Sem `JwtAuthGuard` de propósito — gateways de pagamento não têm token de usuário
 * (docs/10-pagamentos.md → "Auth: assinatura do gateway"). Autenticação aqui é o segredo
 * compartilhado — `X-Webhook-Secret` pro mock, ou `asaas-access-token` (nome de header fixo
 * definido pelo próprio Asaas) quando o token configurado no painel deles bate com
 * `PAYMENT_WEBHOOK_SECRET` (ver `PaymentsService#handleWebhook`).
 */
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':gateway')
  @HttpCode(HttpStatus.OK)
  handle(
    @Param('gateway') _gateway: string,
    @Headers('x-webhook-secret') customSecret: string | undefined,
    @Headers('asaas-access-token') asaasSecret: string | undefined,
    @Body() body: unknown,
  ) {
    return this.paymentsService.handleWebhook(customSecret ?? asaasSecret, body);
  }
}
