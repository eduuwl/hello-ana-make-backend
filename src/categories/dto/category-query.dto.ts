import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;

export class CategoryQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  flat?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  tree?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeInactive?: boolean;
}
