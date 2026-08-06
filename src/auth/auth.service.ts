import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { parseDurationToMs } from '../common/utils/duration';
import {
  ConflictApiException,
  UnauthenticatedApiException,
  ValidationApiException,
} from '../common/exceptions/common.exceptions';
import { ApiException } from '../common/exceptions/api.exception';
import { PublicUser, toPublicUser } from './mappers/user.mapper';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    if (dto.acceptTerms !== true) {
      throw new ValidationApiException({
        acceptTerms: ['Aceite os termos para continuar.'],
      });
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictApiException('E-mail já cadastrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        document: dto.document,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        acceptMarketing: dto.acceptMarketing ?? false,
      },
    });

    return this.issueSession(user.id);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    const passwordMatches = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      throw new ApiException('E-mail ou senha inválidos.', 'INVALID_CREDENTIALS', 401);
    }

    return this.issueSession(user.id, dto.rememberMe);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthenticatedApiException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshTokenHash || !user.refreshTokenExpiresAt) {
      throw new UnauthenticatedApiException();
    }

    const isExpired = user.refreshTokenExpiresAt.getTime() < Date.now();
    const matchesStored = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (isExpired || !matchesStored) {
      throw new UnauthenticatedApiException();
    }

    return this.issueSession(user.id);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        phone: dto.phone,
        document: dto.document,
        avatarUrl: dto.avatarUrl,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
    return toPublicUser(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return; // resposta genérica no controller — não revela se o e-mail existe
    }

    const rawToken = randomUUID();
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // TODO: integrar provedor de e-mail (SES/Resend/Postmark) para enviar rawToken por link.
    // eslint-disable-next-line no-console
    console.log(`[auth] reset token para ${user.email}: ${rawToken}`);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    if (dto.password !== dto.passwordConfirmation) {
      throw new ValidationApiException({
        passwordConfirmation: ['As senhas não conferem.'],
      });
    }

    const candidates = await this.prisma.user.findMany({
      where: { resetPasswordTokenHash: { not: null } },
    });

    let matchedUserId: string | null = null;
    for (const candidate of candidates) {
      if (
        candidate.resetPasswordTokenHash &&
        (await bcrypt.compare(dto.token, candidate.resetPasswordTokenHash))
      ) {
        matchedUserId = candidate.id;
        break;
      }
    }

    const user = candidates.find((c) => c.id === matchedUserId);
    const isExpired = !user?.resetPasswordExpiresAt || user.resetPasswordExpiresAt.getTime() < Date.now();

    if (!user || isExpired) {
      throw new ValidationApiException({ token: ['Token inválido ou expirado.'] });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      },
    });
  }

  getSignupPromotion() {
    const enabled = this.config.get('SIGNUP_PROMOTION_ENABLED', 'true') === 'true';
    if (!enabled) {
      return { success: false, message: 'Nenhuma promoção de cadastro ativa no momento.' };
    }

    return {
      success: true,
      message: 'Cadastre-se e ganhe 10% de desconto na primeira compra.',
      couponCode: this.config.get('SIGNUP_PROMOTION_COUPON_CODE', 'BEMVINDA10'),
      discountPercentage: Number(this.config.get('SIGNUP_PROMOTION_DISCOUNT_PERCENTAGE', '10')),
    };
  }

  private async issueSession(userId: string, rememberMe = false): Promise<AuthSession> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const accessExpiresIn = this.config.get('JWT_ACCESS_EXPIRES_IN', '30m');
    const refreshExpiresIn = rememberMe
      ? this.config.get('JWT_REFRESH_EXPIRES_IN_REMEMBER', '90d')
      : this.config.get('JWT_REFRESH_EXPIRES_IN', '30d');

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: accessExpiresIn },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, tokenType: 'refresh' },
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: refreshExpiresIn },
    );

    const refreshExpiresAt = new Date(Date.now() + parseDurationToMs(refreshExpiresIn));

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, BCRYPT_ROUNDS),
        refreshTokenExpiresAt: refreshExpiresAt,
      },
    });

    return {
      user: toPublicUser(updated),
      accessToken,
      refreshToken,
      expiresAt: refreshExpiresAt.toISOString(),
    };
  }
}
