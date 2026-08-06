import { IsBoolean, IsEmail, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsBoolean()
  acceptTerms: boolean;

  @IsOptional()
  @IsBoolean()
  acceptMarketing?: boolean;

  @IsOptional()
  @IsString()
  referralCode?: string;
}
