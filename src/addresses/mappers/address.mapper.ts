import { Address as AddressModel } from '@prisma/client';

export interface AddressResponse {
  id: string;
  userId: string;
  label: string | null;
  recipientName: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toAddressResponse(address: AddressModel): AddressResponse {
  return {
    id: address.id,
    userId: address.userId,
    label: address.label,
    recipientName: address.recipientName,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    country: address.country,
    phone: address.phone,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}
