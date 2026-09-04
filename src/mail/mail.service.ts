import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Envio de e-mails transacionais via API REST do Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sem SDK — só `fetch`, no mesmo espírito de `AsaasPaymentGateway`. Nunca lança: se
 * RESEND_API_KEY não estiver configurada ou a chamada falhar, loga e segue — envio de
 * e-mail é best-effort e não pode derrubar o fluxo principal (cadastro, pedido, etc).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY não configurada — e-mail para ${input.to} ("${input.subject}") não foi enviado.`,
      );
      return;
    }

    const from = this.config.get<string>('MAIL_FROM', 'Hello Ana Make <onboarding@resend.dev>');

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => undefined);
        this.logger.error(
          `Falha ao enviar e-mail para ${input.to}: ${response.status} ${JSON.stringify(data)}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erro ao enviar e-mail para ${input.to}: ${message}`);
    }
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.send({
      to,
      subject: 'Redefinição de senha — Hello Ana Make',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #2D2027;">Redefinição de senha</h2>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta na Hello Ana Make.</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2D2027; color: #fff; text-decoration: none; border-radius: 8px;">
              Redefinir senha
            </a>
          </p>
          <p>Se você não solicitou isso, pode ignorar este e-mail — sua senha não será alterada.</p>
          <p style="color: #888; font-size: 12px;">Este link expira em algumas horas por segurança.</p>
        </div>
      `,
    });
  }

  async sendOrderConfirmation(
    to: string,
    input: { orderNumber: string; total: string; itemsHtml: string },
  ): Promise<void> {
    await this.send({
      to,
      subject: `Pedido ${input.orderNumber} confirmado — Hello Ana Make`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #2D2027;">Recebemos seu pedido!</h2>
          <p>Seu pedido <strong>${input.orderNumber}</strong> foi confirmado e já está sendo preparado.</p>
          <div style="margin: 16px 0;">${input.itemsHtml}</div>
          <p style="font-size: 16px;"><strong>Total: ${input.total}</strong></p>
          <p style="color: #888; font-size: 12px;">Você pode acompanhar o status do pedido na sua conta.</p>
        </div>
      `,
    });
  }
}
