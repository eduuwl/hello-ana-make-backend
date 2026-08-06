import { User as UserModel } from '@prisma/client';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  document: string | null;
  avatarUrl: string | null;
  birthDate: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toPublicUser(user: UserModel): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    document: user.document,
    avatarUrl: user.avatarUrl,
    birthDate: user.birthDate ? user.birthDate.toISOString() : null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
