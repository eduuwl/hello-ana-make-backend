import { Injectable } from '@nestjs/common';
import { RewardTier as RewardTierModel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictApiException, NotFoundApiException } from '../common/exceptions/common.exceptions';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/dto/paginated-response.dto';
import { toRewardTierResponse } from './mappers/reward-tier.mapper';
import { UpsertRewardTierDto } from './dto/upsert-reward-tier.dto';
import { UpdateRewardTierDto } from './dto/update-reward-tier.dto';

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTiers() {
    const tiers = await this.prisma.rewardTier.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { items: tiers.map(toRewardTierResponse) };
  }

  /** docs/07-recompensas.md → fórmula de progresso do brinde. */
  async getProgress(eligibleAmount: number) {
    const tiers = await this.prisma.rewardTier.findMany({
      where: { isActive: true },
      orderBy: { minimumAmount: 'asc' },
    });

    const currentReward = [...tiers].reverse().find((t) => toNumber(t.minimumAmount) <= eligibleAmount);
    const nextReward = tiers.find((t) => toNumber(t.minimumAmount) > eligibleAmount);

    const previousThreshold = currentReward ? toNumber(currentReward.minimumAmount) : 0;
    const nextThreshold = nextReward ? toNumber(nextReward.minimumAmount) : previousThreshold;
    const span = Math.max(nextThreshold - previousThreshold, 1);

    let progressPercentage: number;
    if (nextReward) {
      progressPercentage = Math.min(100, Math.round(((eligibleAmount - previousThreshold) / span) * 100));
    } else if (currentReward) {
      progressPercentage = 100;
    } else if (tiers.length) {
      progressPercentage = Math.min(100, Math.round((eligibleAmount / toNumber(tiers[0].minimumAmount)) * 100));
    } else {
      progressPercentage = 0;
    }

    const amountRemaining = nextReward
      ? round2(Math.max(0, toNumber(nextReward.minimumAmount) - eligibleAmount))
      : 0;

    return {
      cartEligibleAmount: eligibleAmount,
      currentReward: currentReward ? toRewardTierResponse(currentReward) : undefined,
      nextReward: nextReward ? toRewardTierResponse(nextReward) : undefined,
      amountRemaining,
      progressPercentage,
      isUnlocked: currentReward != null,
    };
  }

  /** Usado no snapshot de pedido (docs/07-recompensas.md → "No pedido"). */
  async getCurrentTierForEligibleAmount(eligibleAmount: number): Promise<RewardTierModel | null> {
    const tiers = await this.prisma.rewardTier.findMany({
      where: { isActive: true },
      orderBy: { minimumAmount: 'asc' },
    });
    return [...tiers].reverse().find((t) => toNumber(t.minimumAmount) <= eligibleAmount) ?? null;
  }

  async adminList(pagination: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.rewardTier.findMany({
        orderBy: { sortOrder: 'asc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.rewardTier.count(),
    ]);
    return paginate(items.map(toRewardTierResponse), total, pagination.page, pagination.pageSize);
  }

  async create(dto: UpsertRewardTierDto) {
    await this.assertUniqueMinimumAmount(dto.minimumAmount);
    const tier = await this.prisma.rewardTier.create({
      data: {
        minimumAmount: dto.minimumAmount,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        rewardName: dto.reward.name,
        rewardDescription: dto.reward.description ?? '',
        rewardImage: dto.reward.image ?? '',
      },
    });
    return toRewardTierResponse(tier);
  }

  async update(id: string, dto: UpdateRewardTierDto) {
    await this.findByIdOrThrow(id);
    if (dto.minimumAmount !== undefined) {
      await this.assertUniqueMinimumAmount(dto.minimumAmount, id);
    }

    const tier = await this.prisma.rewardTier.update({
      where: { id },
      data: {
        minimumAmount: dto.minimumAmount,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
        rewardName: dto.reward?.name,
        rewardDescription: dto.reward?.description,
        rewardImage: dto.reward?.image,
      },
    });
    return toRewardTierResponse(tier);
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.rewardTier.update({ where: { id }, data: { isActive: false } });
  }

  private async assertUniqueMinimumAmount(minimumAmount: number, excludeId?: string): Promise<void> {
    const existing = await this.prisma.rewardTier.findFirst({
      where: { minimumAmount, isActive: true, id: excludeId ? { not: excludeId } : undefined },
    });
    if (existing) {
      throw new ConflictApiException('Já existe um tier ativo com esse valor mínimo.', 'REWARD_TIER_DUPLICATE_MINIMUM');
    }
  }

  private async findByIdOrThrow(id: string) {
    const tier = await this.prisma.rewardTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundApiException('Tier de recompensa não encontrado.');
    return tier;
  }
}
