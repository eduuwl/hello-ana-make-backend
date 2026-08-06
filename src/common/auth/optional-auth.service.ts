import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Extrai o usuário do Bearer token quando presente, sem exigir autenticação —
 * usado em rotas públicas-com-benefício-se-logado (ex.: carrinho guest x cliente).
 */
@Injectable()
export class OptionalAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getUserFromRequest(request: Request): Promise<AuthenticatedUser | null> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      return user ? { id: user.id, email: user.email, role: user.role } : null;
    } catch {
      return null;
    }
  }
}
