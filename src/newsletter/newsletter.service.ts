import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

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
    return { message: 'Inscrição confirmada! Fique de olho na sua caixa de entrada.' };
  }
}
