import { HttpStatus } from '@nestjs/common';
import { ApiException } from './api.exception';

export class NotFoundApiException extends ApiException {
  constructor(message = 'Recurso não encontrado.') {
    super(message, 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export class ConflictApiException extends ApiException {
  constructor(message: string, code = 'CONFLICT') {
    super(message, code, HttpStatus.CONFLICT);
  }
}

export class ValidationApiException extends ApiException {
  constructor(errors: Record<string, string[]>, message = 'Os dados enviados são inválidos.') {
    super(message, 'VALIDATION_ERROR', HttpStatus.UNPROCESSABLE_ENTITY, errors);
  }
}

export class UnauthenticatedApiException extends ApiException {
  constructor(message = 'Não autenticado.') {
    super(message, 'UNAUTHENTICATED', HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenApiException extends ApiException {
  constructor(message = 'Acesso negado.') {
    super(message, 'FORBIDDEN', HttpStatus.FORBIDDEN);
  }
}
