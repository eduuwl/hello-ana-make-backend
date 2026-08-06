import { Brand as BrandModel } from '@prisma/client';

export interface BrandResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toBrandResponse(brand: BrandModel): BrandResponse {
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    description: brand.description,
    logo: brand.logo,
    website: brand.website,
    isActive: brand.isActive,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}
