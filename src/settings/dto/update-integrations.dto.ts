import { IsOptional, IsString } from 'class-validator';

export class UpdateIntegrationsDto {
  @IsOptional()
  @IsString()
  paymentGateway?: string;

  @IsOptional()
  @IsString()
  asaasApiKey?: string;

  @IsOptional()
  @IsString()
  shippingProvider?: string;

  @IsOptional()
  @IsString()
  superfreteToken?: string;
}
