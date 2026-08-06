import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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
