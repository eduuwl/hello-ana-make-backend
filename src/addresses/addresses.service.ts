import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException } from '../common/exceptions/common.exceptions';
import { UpsertAddressDto } from './dto/upsert-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { toAddressResponse } from './mappers/address.mapper';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return { items: addresses.map(toAddressResponse) };
  }

  async getById(userId: string, id: string) {
    const address = await this.findOwnedOrThrow(userId, id);
    return toAddressResponse(address);
  }

  async create(userId: string, dto: UpsertAddressDto) {
    const isFirst = (await this.prisma.address.count({ where: { userId } })) === 0;
    const shouldBeDefault = isFirst || dto.isDefault === true;

    if (shouldBeDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    const address = await this.prisma.address.create({
      data: {
        userId,
        label: dto.label,
        recipientName: dto.recipientName,
        street: dto.street,
        number: dto.number,
        complement: dto.complement,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        country: dto.country ?? 'BR',
        phone: dto.phone,
        isDefault: shouldBeDefault,
      },
    });
    return toAddressResponse(address);
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.findOwnedOrThrow(userId, id);

    if (dto.isDefault === true) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    const address = await this.prisma.address.update({ where: { id }, data: dto });
    return toAddressResponse(address);
  }

  async remove(userId: string, id: string): Promise<void> {
    const address = await this.findOwnedOrThrow(userId, id);
    await this.prisma.address.delete({ where: { id } });

    if (address.isDefault) {
      const mostRecent = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (mostRecent) {
        await this.prisma.address.update({
          where: { id: mostRecent.id },
          data: { isDefault: true },
        });
      }
    }
  }

  async setDefault(userId: string, id: string) {
    await this.findOwnedOrThrow(userId, id);
    await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    const address = await this.prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });
    return toAddressResponse(address);
  }

  private async findOwnedOrThrow(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address || address.userId !== userId) {
      throw new NotFoundApiException('Endereço não encontrado.');
    }
    return address;
  }
}
