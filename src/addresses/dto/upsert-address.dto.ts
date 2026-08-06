import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MinLength(1)
  recipientName: string;

  @IsString()
  @MinLength(1)
  street: string;

  @IsString()
  @MinLength(1)
  number: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  @MinLength(1)
  neighborhood: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsString()
  @MinLength(2)
  state: string;

  @IsString()
  @MinLength(8)
  zipCode: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
