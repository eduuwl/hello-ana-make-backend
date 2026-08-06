import { Category as CategoryModel } from '@prisma/client';

export interface CategoryResponse {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  parentId: string | null;
  productCount: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryTreeResponse extends CategoryResponse {
  children: CategoryTreeResponse[];
}

export function toCategoryResponse(
  category: CategoryModel,
  productCount = 0,
): CategoryResponse {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    image: category.image,
    parentId: category.parentId,
    productCount,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
