import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Idempotente de propósito: assinar de novo com o mesmo e-mail não é erro (usuário pode ter
   * clicado duas vezes, ou já ter assinado antes e esquecido) — sempre responde sucesso.
   */
  async subscribe(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();
    await this.prisma.newsletterSubscriber.upsert({
      where: { email: normalized },
      create: { email: normalized },
      update: {},
    });
    // MailService#send nunca lança (loga e segue sem RESEND_API_KEY ou se a Resend falhar) —
    // não precisa de try/catch aqui, a resposta de sucesso não depende do e-mail ter saído.
    await this.mailService.sendNewsletterConfirmation(normalized);
    return { message: 'Inscrição confirmada! Fique de olho na sua caixa de entrada.' };
  }
}
