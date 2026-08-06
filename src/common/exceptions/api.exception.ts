import { HttpException } from '@nestjs/common';

export interface ApiErrorBody {
  message: string;
  code: string;
  errors: Record<string, string[]>;
}

/**
 * Exceção que já carrega o shape de erro do contrato REST
 * (docs/README.md → "Erros padrão"): { message, code, errors }.
 */
export class ApiException extends HttpException {
  constructor(
    message: string,
    code: string,
    status: number,
    errors: Record<string, string[]> = {},
  ) {
    const body: ApiErrorBody = { message, code, errors };
    super(body, status);
  }
}
