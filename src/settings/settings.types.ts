export interface StoreSettings {
  store: {
    name: string;
    legalName?: string;
    document?: string;
    email: string;
    phone?: string;
    instagramUrl?: string;
  };
  checkout: {
    enabledPaymentMethods: string[];
    maxInstallments: number;
    minInstallmentAmount: number;
    allowGuestCheckout: boolean;
  };
  shipping: {
    originZipCode: string;
    defaultWeightGrams: number;
    defaultWidthCm: number;
    defaultHeightCm: number;
    defaultLengthCm: number;
    freeShippingThresholds: {
      PAC?: number | null;
      SEDEX?: number | null;
      EXPRESSA?: number | null;
    };
  };
  rewards: {
    enabled: boolean;
  };
  signupPromotion: {
    enabled: boolean;
    couponCode: string;
    discountPercentage: number;
    message: string;
    expiresAt?: string;
  };
  integrations: {
    paymentGateway: string;
    shippingProvider: string;
    asaasApiKey?: string;
    superfreteToken?: string;
  };
  currency: 'BRL';
  timezone: string;
  updatedAt: string;
}

export type PublicStoreSettings = Pick<StoreSettings, 'currency'> & {
  store: Pick<StoreSettings['store'], 'name' | 'email' | 'phone' | 'instagramUrl'>;
  checkout: Pick<StoreSettings['checkout'], 'enabledPaymentMethods' | 'maxInstallments'>;
  rewards: StoreSettings['rewards'];
  signupPromotion: StoreSettings['signupPromotion'];
};

// docs/15-configuracoes.md → valores default single-tenant.
export const DEFAULT_STORE_SETTINGS: Omit<StoreSettings, 'updatedAt'> = {
  store: {
    name: 'Hello Ana Make',
    email: 'contato@helloanamake.com',
    phone: '11999990000',
    instagramUrl: 'https://instagram.com/helloanamake',
  },
  checkout: {
    enabledPaymentMethods: ['pix', 'credit_card', 'boleto'],
    maxInstallments: 6,
    minInstallmentAmount: 30,
    allowGuestCheckout: false,
  },
  shipping: {
    originZipCode: '01310100',
    defaultWeightGrams: 200,
    defaultWidthCm: 16,
    defaultHeightCm: 10,
    defaultLengthCm: 20,
    freeShippingThresholds: {
      PAC: 149,
      SEDEX: 249,
      EXPRESSA: null,
    },
  },
  rewards: {
    enabled: true,
  },
  signupPromotion: {
    enabled: false,
    couponCode: 'BEMVINDA10',
    discountPercentage: 10,
    message: 'Cadastre-se e ganhe 10% de desconto na primeira compra.',
  },
  integrations: {
    paymentGateway: 'mock',
    shippingProvider: 'mock',
  },
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
};
