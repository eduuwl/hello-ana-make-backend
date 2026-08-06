import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorBody } from '../exceptions/api.exception';

const STATUS_CODE_FALLBACK: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
};

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    'code' in body &&
    'errors' in body
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isApiErrorBody(body)) {
        response.status(status).json(body);
        return;
      }

      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] })?.message ?? exception.message);

      response.status(status).json({
        message: Array.isArray(message) ? message[0] : message,
        code: STATUS_CODE_FALLBACK[status] ?? 'ERROR',
        errors: {},
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Erro interno do servidor.',
      code: 'INTERNAL_ERROR',
      errors: {},
    });
  }
}
