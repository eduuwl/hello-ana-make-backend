import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/exceptions/api.exception';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { ShippingQuoteDto } from './dto/shipping-quote.dto';

interface ShippingOptionDefinition {
  id: string;
  provider: string;
  serviceName: string;
  serviceCode: string;
  basePrice: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  freeAbove: number | null;
}

// docs/08-frete.md → tabela de opções mock (SuperFrete-ready).
const SHIPPING_OPTIONS: ShippingOptionDefinition[] = [
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

@Injectable()
export class ShippingService {
  quote(dto: ShippingQuoteDto) {
    const normalizedZip = dto.zipCode.replace(/\D/g, '');
    if (normalizedZip.length !== 8) {
      throw new ApiException('CEP inválido.', 'INVALID_ZIP_CODE', 422);
    }

    const subtotal = dto.subtotal ?? 0;
    const options = SHIPPING_OPTIONS.map((option) => {
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

    return {
      zipCode: normalizedZip,
      quotedAt: new Date().toISOString(),
      options,
    };
  }

  priceFor(shippingOptionId: string, subtotal: number): number {
    const option = SHIPPING_OPTIONS.find((o) => o.id === shippingOptionId);
    if (!option) {
      throw new NotFoundApiException('Opção de frete não encontrada.');
    }
    const isFree = option.freeAbove !== null && subtotal >= option.freeAbove;
    return isFree ? 0 : option.basePrice;
  }
}
