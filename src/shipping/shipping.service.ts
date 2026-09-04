import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/exceptions/api.exception';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { ShippingQuoteDto, ShippingQuoteItemDto } from './dto/shipping-quote.dto';
import { SettingsService } from '../settings/settings.service';
import { StoreSettings } from '../settings/settings.types';

interface MockShippingOptionDefinition {
  id: string;
  provider: string;
  serviceName: string;
  serviceCode: string;
  basePrice: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  freeAbove: number | null;
}

export interface ShippingOptionResult {
  id: string;
  provider: string;
  serviceName: string;
  serviceCode: string;
  price: number;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isFree: boolean;
}

interface SuperFreteQuoteItem {
  id: number;
  name: string;
  price: string | number;
  delivery_time?: number;
  delivery_range?: { min: number; max: number };
  company?: { id: number; name: string; picture?: string };
  has_error?: boolean;
  error?: string;
}

// docs/08-frete.md → tabela de opções mock, usada quando integrations.shippingProvider !== "superfrete"
// (ou sem token configurado) — fallback seguro, nunca quebra o checkout.
const MOCK_SHIPPING_OPTIONS: MockShippingOptionDefinition[] = [
  {
    id: 'ship-pac',
    provider: 'Correios',
    serviceName: 'PAC',
    serviceCode: 'PAC',
    basePrice: 14.9,
    estimatedDaysMin: 6,
    estimatedDaysMax: 12,
    freeAbove: 149,
  },
  {
    id: 'ship-sedex',
    provider: 'Correios',
    serviceName: 'SEDEX',
    serviceCode: 'SEDEX',
    basePrice: 24.9,
    estimatedDaysMin: 2,
    estimatedDaysMax: 5,
    freeAbove: 249,
  },
  {
    id: 'ship-expressa',
    provider: 'SuperFrete',
    serviceName: 'Expressa',
    serviceCode: 'EXPRESSA',
    basePrice: 34.9,
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
    freeAbove: null,
  },
];

// Códigos de serviço estáveis da API da SuperFrete (docs oficiais): 1 = Correios PAC, 2 = Correios SEDEX.
const SUPERFRETE_SERVICES = '1,2';
const SUPERFRETE_FREE_THRESHOLD_KEY_BY_SERVICE_ID: Record<number, 'PAC' | 'SEDEX'> = {
  1: 'PAC',
  2: 'SEDEX',
};

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async quote(dto: ShippingQuoteDto) {
    const normalizedZip = dto.zipCode.replace(/\D/g, '');
    if (normalizedZip.length !== 8) {
      throw new ApiException('CEP inválido.', 'INVALID_ZIP_CODE', 422);
    }

    const subtotal = dto.subtotal ?? 0;
    const options = await this.getOptions(normalizedZip, dto.items, subtotal);

    return {
      zipCode: normalizedZip,
      quotedAt: new Date().toISOString(),
      options,
    };
  }

  /**
   * Recalcula o preço em tempo real (mesma fonte que `quote()`) em vez de confiar no preço
   * que o cliente viu no checkout — necessário porque com a SuperFrete real os preços são
   * dinâmicos e os IDs (`sf-<serviceId>`) não são um catálogo fixo como no mock.
   */
  async priceFor(
    shippingOptionId: string,
    subtotal: number,
    zipCode: string,
    items: ShippingQuoteItemDto[] = [],
  ): Promise<number> {
    const normalizedZip = zipCode.replace(/\D/g, '');
    const options = await this.getOptions(normalizedZip, items, subtotal);
    const option = options.find((o) => o.id === shippingOptionId);
    if (!option) {
      throw new NotFoundApiException('Opção de frete não encontrada.');
    }
    return option.price;
  }

  private async getOptions(
    zipCode: string,
    items: ShippingQuoteItemDto[],
    subtotal: number,
  ): Promise<ShippingOptionResult[]> {
    const settings = await this.settingsService.getInternal();
    const { integrations } = settings;

    if (integrations.shippingProvider === 'superfrete' && integrations.superfreteToken) {
      try {
        return await this.quoteViaSuperFrete(settings, zipCode, items, subtotal);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Falha ao cotar frete real na SuperFrete, usando tabela simulada: ${message}`);
      }
    }

    return this.quoteMock(subtotal);
  }

  private quoteMock(subtotal: number): ShippingOptionResult[] {
    return MOCK_SHIPPING_OPTIONS.map((option) => {
      const isFree = option.freeAbove !== null && subtotal >= option.freeAbove;
      return {
        id: option.id,
        provider: option.provider,
        serviceName: option.serviceName,
        serviceCode: option.serviceCode,
        price: isFree ? 0 : option.basePrice,
        currency: 'BRL',
        estimatedDaysMin: option.estimatedDaysMin,
        estimatedDaysMax: option.estimatedDaysMax,
        isFree,
      };
    });
  }

  // docs/08-frete.md + https://superfrete.readme.io/reference/cotacao-de-frete → POST /api/v0/calculator.
  // Sem peso/dimensão real por produto no banco ainda — usa os defaults de StoreSettings.shipping
  // (por item, se o chamador informar `weightGrams`/`*Cm`; senão cai no default da loja).
  private async quoteViaSuperFrete(
    settings: StoreSettings,
    zipCode: string,
    items: ShippingQuoteItemDto[],
    subtotal: number,
  ): Promise<ShippingOptionResult[]> {
    const { shipping, integrations, store } = settings;
    const baseUrl = this.config.get<string>('SUPERFRETE_API_URL', 'https://sandbox.superfrete.com');

    const products =
      items.length > 0
        ? items.map((item) => ({
            quantity: item.quantity,
            weight: (item.weightGrams ?? shipping.defaultWeightGrams) / 1000,
            width: item.widthCm ?? shipping.defaultWidthCm,
            height: item.heightCm ?? shipping.defaultHeightCm,
            length: item.lengthCm ?? shipping.defaultLengthCm,
          }))
        : [
            {
              quantity: 1,
              weight: shipping.defaultWeightGrams / 1000,
              width: shipping.defaultWidthCm,
              height: shipping.defaultHeightCm,
              length: shipping.defaultLengthCm,
            },
          ];

    const response = await fetch(`${baseUrl}/api/v0/calculator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${integrations.superfreteToken}`,
        'User-Agent': `Hello Ana Make (${store.email})`,
      },
      body: JSON.stringify({
        from: { postal_code: shipping.originZipCode },
        to: { postal_code: zipCode },
        services: SUPERFRETE_SERVICES,
        products,
      }),
    });

    if (!response.ok) {
      throw new Error(`SuperFrete respondeu ${response.status} ${response.statusText}`);
    }

    const data = (await response.json().catch(() => undefined)) as SuperFreteQuoteItem[] | undefined;
    if (!Array.isArray(data)) {
      throw new Error('Resposta inesperada da SuperFrete (formato inválido).');
    }

    const options = data
      .filter((item) => !item.has_error && !item.error)
      .map((item): ShippingOptionResult => {
        const price = typeof item.price === 'string' ? Number(item.price) : item.price;
        const thresholdKey = SUPERFRETE_FREE_THRESHOLD_KEY_BY_SERVICE_ID[item.id];
        const freeAbove = thresholdKey ? shipping.freeShippingThresholds[thresholdKey] : null;
        const isFree = freeAbove != null && subtotal >= freeAbove;

        return {
          id: `sf-${item.id}`,
          provider: item.company?.name ?? 'SuperFrete',
          serviceName: item.name,
          serviceCode: String(item.id),
          price: isFree ? 0 : price,
          currency: 'BRL',
          estimatedDaysMin: item.delivery_range?.min ?? item.delivery_time ?? 0,
          estimatedDaysMax: item.delivery_range?.max ?? item.delivery_time ?? 0,
          isFree,
        };
      });

    if (options.length === 0) {
      throw new Error('Nenhuma opção de frete válida retornada pela SuperFrete.');
    }

    return options;
  }
}
