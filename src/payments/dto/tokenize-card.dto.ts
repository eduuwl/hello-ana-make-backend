import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Dados do cartão + endereço de cobrança necessários pra tokenizar no gateway ativo
 * (POST /payments/tokenize-card). Nome/e-mail/CPF/telefone do titular vêm do perfil
 * do usuário autenticado (mesma resolução de `customer` usada em createPayment) —
 * não precisam ser reenviados aqui.
 */
export class TokenizeCardDto {
  @IsString()
  holderName: string;

  @IsString()
  number: string;

  @IsString()
  @Length(1, 2)
  expiryMonth: string;

  @IsString()
  @Length(4, 4)
  expiryYear: string;

  @IsString()
  ccv: string;

  @IsString()
  postalCode: string;

  @IsString()
  addressNumber: string;

  @IsOptional()
  @IsString()
  addressComplement?: string;
}
