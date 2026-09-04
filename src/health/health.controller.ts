import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rota de monitoramento (ex.: UptimeRobot) — faz uma query real no Postgres, não só
 * responde 200 estático, pra também evitar o autosuspend do Neon (plano free), não só
 * o sleep do Render. Pública, sem guard, de propósito.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
