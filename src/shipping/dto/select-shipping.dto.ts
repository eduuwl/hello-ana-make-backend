import { IsString } from 'class-validator';

export class SelectShippingDto {
  @IsString()
  shippingOptionId: string;

  @IsString()
  zipCode: string;
}
