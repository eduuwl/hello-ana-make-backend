import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, ValidationError } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationApiException } from './common/exceptions/common.exceptions';
import { UPLOADS_DIR } from './uploads/uploads.constants';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      acc[path] = Object.values(error.constraints);
    }

    if (error.children?.length) {
      Object.assign(acc, flattenValidationErrors(error.children, path));
    }

    return acc;
  }, {});
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  // Fora do prefixo /api/v1 — URLs de upload são absolutas (docs/14-admin.md → "/uploads/abc.webp").
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => new ValidationApiException(flattenValidationErrors(errors)),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 8000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Hello Ana Make API rodando em http://localhost:${port}/api/v1`);
}

bootstrap();
