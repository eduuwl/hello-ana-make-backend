import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

const PROMOTION_TYPES = [
  'direct_discount',
  'buy_x_get_y',
  'progressive',
  'flash_sale',
  'kit',
  'campaign',
] as const;

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;

export class PromotionQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  activeOnly?: boolean;

  @IsOptional()
  @IsIn(PROMOTION_TYPES)
  type?: (typeof PROMOTION_TYPES)[number];
}
