import { Injectable } from '@nestjs/common';
import { Prisma, StoreSettings as StoreSettingsRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_STORE_SETTINGS, PublicStoreSettings, StoreSettings } from './settings.types';
import { UpdateStoreSettingsDto } from './dto/update-settings.dto';
import { UpdateIntegrationsDto } from './dto/update-integrations.dto';
import { deepMerge } from './deep-merge.util';

const SETTINGS_ID = 'singleton';

function maskSecret(value?: string): string | undefined {
  if (!value) return undefined;
  const prefix = value.includes('_') ? value.split('_')[0] : value.slice(0, 4);
  return `${prefix}_****`;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic(): Promise<PublicStoreSettings> {
    const data = await this.getData();
    return {
      store: {
        name: data.store.name,
        email: data.store.email,
        phone: data.store.phone,
        instagramUrl: data.store.instagramUrl,
      },
      checkout: {
        enabledPaymentMethods: data.checkout.enabledPaymentMethods,
        maxInstallments: data.checkout.maxInstallments,
      },
      rewards: data.rewards,
      signupPromotion: data.signupPromotion,
      currency: data.currency,
    };
  }

  async getAdmin(): Promise<StoreSettings> {
    const row = await this.getOrCreateRow();
    return this.toMaskedResponse(row);
  }

  /** Uso interno (server-side): settings completos, secrets em texto puro. Nunca expor via HTTP. */
  async getInternal(): Promise<StoreSettings> {
    return this.getData();
  }

  async update(dto: UpdateStoreSettingsDto): Promise<StoreSettings> {
    const row = await this.getOrCreateRow();
    const current = row.data as unknown as StoreSettings;
    const merged = deepMerge(current as unknown as Record<string, unknown>, dto as Record<string, unknown>) as unknown as StoreSettings;

    const updated = await this.prisma.storeSettings.update({
      where: { id: row.id },
      data: { data: merged as unknown as Prisma.InputJsonValue },
    });
    return this.toMaskedResponse(updated);
  }

  async updateIntegrations(dto: UpdateIntegrationsDto) {
    const row = await this.getOrCreateRow();
    const current = row.data as unknown as StoreSettings;
    const merged: StoreSettings = {
      ...current,
      integrations: {
        paymentGateway: dto.paymentGateway ?? current.integrations.paymentGateway,
        shippingProvider: dto.shippingProvider ?? current.integrations.shippingProvider,
        asaasApiKey: dto.asaasApiKey ?? current.integrations.asaasApiKey,
        superfreteToken: dto.superfreteToken ?? current.integrations.superfreteToken,
      },
    };

    const updated = await this.prisma.storeSettings.update({
      where: { id: row.id },
      data: { data: merged as unknown as Prisma.InputJsonValue },
    });
    const data = updated.data as unknown as StoreSettings;
    return {
      paymentGateway: data.integrations.paymentGateway,
      shippingProvider: data.integrations.shippingProvider,
      asaasApiKey: maskSecret(data.integrations.asaasApiKey),
      superfreteToken: maskSecret(data.integrations.superfreteToken),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  private toMaskedResponse(row: StoreSettingsRow): StoreSettings {
    const data = row.data as unknown as StoreSettings;
    return {
      ...data,
      integrations: {
        ...data.integrations,
        asaasApiKey: maskSecret(data.integrations.asaasApiKey),
        superfreteToken: maskSecret(data.integrations.superfreteToken),
      },
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async getData(): Promise<StoreSettings> {
    const row = await this.getOrCreateRow();
    return { ...(row.data as unknown as StoreSettings), updatedAt: row.updatedAt.toISOString() };
  }

  private async getOrCreateRow(): Promise<StoreSettingsRow> {
    const existing = await this.prisma.storeSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;

    return this.prisma.storeSettings.create({
      data: {
        id: SETTINGS_ID,
        data: DEFAULT_STORE_SETTINGS as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
