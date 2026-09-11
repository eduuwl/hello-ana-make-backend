import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';
import { IsCpfCnpj } from '../../common/validators/is-cpf-cnpj.validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsCpfCnpj()
  document?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsBoolean()
  acceptMarketing?: boolean;
}
