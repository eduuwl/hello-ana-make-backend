import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

/** Rótulos amigáveis pros campos únicos mais comuns (usados na mensagem de P2002). */
const FIELD_LABELS: Record<string, string> = {
  slug: 'slug',
  code: 'código',
  sku: 'SKU',
  email: 'e-mail',
  orderNumber: 'número de pedido',
  transactionId: 'ID de transação',
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

/** Extrai os nomes de campo de `error.meta.target`, que vem como string[] ou string. */
function extractTargetFields(target: unknown): string[] {
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') {
    // Postgres às vezes manda o nome do índice (ex.: "Brand_slug_key").
    const match = target.match(/_([A-Za-z0-9]+)_key$/);
    return match ? [match[1]] : [target];
  }
  return [];
}

function humanizeFields(fields: string[]): string {
  return fields.map((f) => FIELD_LABELS[f] ?? f).join(', ');
}

interface MappedError {
  status: number;
  body: ApiErrorBody;
}

/** Traduz os erros conhecidos do Prisma pro shape de erro do contrato REST. */
function mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): MappedError | null {
  switch (exception.code) {
    case 'P2002': {
      const fields = extractTargetFields(exception.meta?.target);
      const label = fields.length ? humanizeFields(fields) : null;
      return {
        status: HttpStatus.CONFLICT,
        body: {
          message: label
            ? `Já existe um registro com esse ${label}.`
            : 'Já existe um registro com um valor que precisa ser único.',
          code: 'CONFLICT',
          errors: fields.length
            ? fields.reduce<Record<string, string[]>>((acc, f) => {
                acc[f] = ['Este valor já está em uso.'];
                return acc;
              }, {})
            : {},
        },
      };
    }
    case 'P2025': {
      const cause = exception.meta?.cause;
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          message: typeof cause === 'string' ? cause : 'Registro não encontrado.',
          code: 'NOT_FOUND',
          errors: {},
        },
      };
    }
    case 'P2003':
    case 'P2014':
      return {
        status: HttpStatus.CONFLICT,
        body: {
          message: 'A operação viola um vínculo com outro registro.',
          code: 'CONFLICT',
          errors: {},
        },
      };
    default:
      return null;
  }
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

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        this.logger.warn(
          `Prisma ${exception.code} → ${mapped.status}: ${mapped.body.message}`,
        );
        response.status(mapped.status).json(mapped.body);
        return;
      }
      // Código de Prisma não mapeado: continua sendo 500, mas logamos o código
      // pra facilitar o diagnóstico em vez de só um stack trace genérico.
      this.logger.error(`Prisma ${exception.code} não mapeado: ${exception.message}`);
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`Prisma validation error: ${exception.message}`);
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        message: 'Os dados enviados são inválidos.',
        code: 'VALIDATION_ERROR',
        errors: {},
      });
      return;
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Erro interno do servidor.',
      code: 'INTERNAL_ERROR',
      errors: {},
    });
  }
}
