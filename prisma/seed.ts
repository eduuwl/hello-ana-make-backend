import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_STORE_SETTINGS } from '../src/settings/settings.types';

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@helloanamake.com' },
    update: {},
    create: {
      email: 'admin@helloanamake.com',
      passwordHash: adminPasswordHash,
      name: 'Admin Hello Ana Make',
      role: 'admin',
      emailVerified: true,
    },
  });

  const customerPasswordHash = await bcrypt.hash('helloana123', 10);
  await prisma.user.upsert({
    where: { email: 'ana.silva@email.com' },
    update: {},
    create: {
      email: 'ana.silva@email.com',
      passwordHash: customerPasswordHash,
      name: 'Ana Silva',
      phone: '11999990000',
      document: '12345678901',
      birthDate: new Date('1995-05-20'),
      emailVerified: true,
    },
  });

  const maquiagem = await prisma.category.upsert({
    where: { slug: 'maquiagem' },
    update: {},
    create: {
      slug: 'maquiagem',
      name: 'Maquiagem',
      description: 'Make para todos os momentos.',
      image: 'https://picsum.photos/seed/maquiagem/600/400',
      sortOrder: 1,
    },
  });

  const boca = await prisma.category.upsert({
    where: { slug: 'boca' },
    update: {},
    create: {
      slug: 'boca',
      name: 'Boca',
      description: 'Batons, glosses e lip tints.',
      image: 'https://picsum.photos/seed/boca/600/400',
      parentId: maquiagem.id,
      sortOrder: 1,
    },
  });

  const olhos = await prisma.category.upsert({
    where: { slug: 'olhos' },
    update: {},
    create: {
      slug: 'olhos',
      name: 'Olhos',
      description: 'Sombras, máscaras e delineadores.',
      image: 'https://picsum.photos/seed/olhos/600/400',
      parentId: maquiagem.id,
      sortOrder: 2,
    },
  });

  const anaGlow = await prisma.brand.upsert({
    where: { slug: 'ana-glow' },
    update: {},
    create: {
      slug: 'ana-glow',
      name: 'Ana Glow',
      description: 'Linha própria Hello Ana Make.',
      logo: 'https://picsum.photos/seed/ana-glow/200/200',
      website: 'https://helloanamake.com',
    },
  });

  const luminaBeauty = await prisma.brand.upsert({
    where: { slug: 'lumina-beauty' },
    update: {},
    create: {
      slug: 'lumina-beauty',
      name: 'Lumina Beauty',
      description: 'Cosméticos premium.',
      logo: 'https://picsum.photos/seed/lumina/200/200',
    },
  });

  const existingBatom = await prisma.product.findUnique({
    where: { slug: 'batom-matte-rosa-nude' },
  });
  if (!existingBatom) {
    await prisma.product.create({
      data: {
        slug: 'batom-matte-rosa-nude',
        name: 'Batom Matte Rosa Nude',
        shortDescription: 'Acabamento matte de longa duração.',
        description:
          'Batom matte com alta pigmentação e fórmula hidratante que não resseca os lábios.',
        benefits: ['Longa duração', 'Não resseca', 'Alta pigmentação'],
        brandId: anaGlow.id,
        categoryId: boca.id,
        isFeatured: true,
        isBestseller: true,
        totalStock: 25,
        minEffectivePrice: 39.9,
        maxEffectivePrice: 39.9,
        hasPromotion: true,
        ratingAverage: 4.7,
        ratingCount: 128,
        images: {
          create: [
            {
              url: 'https://picsum.photos/seed/batom-rosa-nude/800/800',
              alt: 'Batom Rosa Nude',
              sortOrder: 0,
              isPrimary: true,
            },
          ],
        },
        variants: {
          create: [
            {
              sku: 'AG-BM-RN-01',
              name: 'Rosa Nude',
              attributes: { color: 'Rosa Nude', colorHex: '#C4877A', shade: 'Nude' },
              price: 49.9,
              promotionalPrice: 39.9,
              stock: 25,
              isAvailable: true,
            },
          ],
        },
        badges: {
          create: [{ label: 'Mais vendido', type: 'bestseller' }],
        },
      },
    });
  }

  const existingSombra = await prisma.product.findUnique({
    where: { slug: 'paleta-sombras-nude-glow' },
  });
  if (!existingSombra) {
    await prisma.product.create({
      data: {
        slug: 'paleta-sombras-nude-glow',
        name: 'Paleta de Sombras Nude Glow',
        shortDescription: '12 cores em tons nude com alta pigmentação.',
        description: 'Paleta versátil para looks do dia a dia e produções mais elaboradas.',
        benefits: ['Alta pigmentação', 'Fácil esfumar'],
        brandId: luminaBeauty.id,
        categoryId: olhos.id,
        isNew: true,
        totalStock: 40,
        minEffectivePrice: 89.9,
        maxEffectivePrice: 89.9,
        hasPromotion: false,
        ratingAverage: 4.5,
        ratingCount: 42,
        images: {
          create: [
            {
              url: 'https://picsum.photos/seed/paleta-nude-glow/800/800',
              alt: 'Paleta de Sombras Nude Glow',
              sortOrder: 0,
              isPrimary: true,
            },
          ],
        },
        variants: {
          create: [
            {
              sku: 'LB-PS-NG-01',
              name: 'Único',
              attributes: {},
              price: 89.9,
              stock: 40,
              isAvailable: true,
            },
          ],
        },
        badges: {
          create: [{ label: 'Novidade', type: 'new' }],
        },
      },
    });
  }

  await prisma.coupon.upsert({
    where: { code: 'BEMVINDA10' },
    update: {},
    create: {
      code: 'BEMVINDA10',
      type: 'percentage',
      value: 10,
      description: '10% de desconto na primeira compra',
      minOrderValue: 50,
      maxDiscountValue: 50,
      firstPurchaseOnly: true,
      perUserLimit: 1,
      startsAt: new Date('2025-01-01T00:00:00.000Z'),
      endsAt: new Date('2027-12-31T23:59:59.000Z'),
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'ANA15' },
    update: {},
    create: {
      code: 'ANA15',
      type: 'percentage',
      value: 15,
      description: '15% de desconto Hello Ana',
      minOrderValue: 80,
      maxDiscountValue: 80,
      usageLimit: 500,
      perUserLimit: 1,
      startsAt: new Date('2025-01-01T00:00:00.000Z'),
      endsAt: new Date('2027-06-30T23:59:59.000Z'),
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'FRETEGRATIS' },
    update: {},
    create: {
      code: 'FRETEGRATIS',
      type: 'free_shipping',
      value: 0,
      description: 'Frete grátis',
      startsAt: new Date('2025-01-01T00:00:00.000Z'),
      endsAt: new Date('2027-12-31T23:59:59.000Z'),
    },
  });

  // docs/07-recompensas.md → faixas padrão sugeridas.
  const rewardTiersSeed = [
    {
      minimumAmount: 50,
      sortOrder: 1,
      rewardName: 'Mini Batom',
      rewardDescription: 'Mini batom Ana Glow em tom surpresa',
      rewardImage: 'https://picsum.photos/seed/mini-batom/400/400',
    },
    {
      minimumAmount: 100,
      sortOrder: 2,
      rewardName: 'Gloss',
      rewardDescription: 'Gloss exclusivo Hello Ana',
      rewardImage: 'https://picsum.photos/seed/gloss/400/400',
    },
    {
      minimumAmount: 150,
      sortOrder: 3,
      rewardName: 'Kit Skincare',
      rewardDescription: 'Kit com amostras Skin Ritual',
      rewardImage: 'https://picsum.photos/seed/kit-skincare/400/400',
    },
    {
      minimumAmount: 250,
      sortOrder: 4,
      rewardName: 'Caixa Especial',
      rewardDescription: 'Caixa especial Hello Ana com produtos selecionados',
      rewardImage: 'https://picsum.photos/seed/caixa-especial/400/400',
    },
  ];
  for (const tier of rewardTiersSeed) {
    const existing = await prisma.rewardTier.findFirst({ where: { minimumAmount: tier.minimumAmount } });
    if (!existing) {
      await prisma.rewardTier.create({ data: { ...tier, isActive: true } });
    }
  }

  await prisma.storeSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', data: DEFAULT_STORE_SETTINGS as unknown as Prisma.InputJsonValue },
  });

  const batom = await prisma.product.findUnique({ where: { slug: 'batom-matte-rosa-nude' } });
  if (batom) {
    await prisma.promotion.upsert({
      where: { slug: 'flash-sale-boca' },
      update: {},
      create: {
        slug: 'flash-sale-boca',
        name: 'Flash Sale Boca',
        description: 'Até 20% off em produtos para boca por tempo limitado.',
        type: 'flash_sale',
        discountPercentage: 20,
        productIds: [batom.id],
        bannerImage: 'https://picsum.photos/seed/flash-sale-boca/1200/400',
        startsAt: new Date('2025-01-01T00:00:00.000Z'),
        endsAt: new Date('2027-12-31T23:59:59.000Z'),
        isActive: true,
        priority: 100,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed concluído: admin@helloanamake.com / admin123 · ana.silva@email.com / helloana123');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
