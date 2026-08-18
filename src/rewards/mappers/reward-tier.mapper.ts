import { RewardTier as RewardTierModel, Prisma } from '@prisma/client';

export interface RewardTierResponse {
  id: string;
  minimumAmount: number;
  isActive: boolean;
  sortOrder: number;
  reward: {
    id: string;
    name: string;
    description: string;
    image: string;
  };
}

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

export function toRewardTierResponse(tier: RewardTierModel): RewardTierResponse {
  return {
    id: tier.id,
    minimumAmount: toNumber(tier.minimumAmount),
    isActive: tier.isActive,
    sortOrder: tier.sortOrder,
    reward: {
      id: tier.id,
      name: tier.rewardName,
      description: tier.rewardDescription,
      image: tier.rewardImage,
    },
  };
}
