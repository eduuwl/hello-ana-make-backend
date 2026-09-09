import { Controller, HttpCode, HttpStatus, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ValidationApiException } from '../common/exceptions/common.exceptions';
import { UPLOADS_DIR } from './uploads.constants';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('admin/uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UploadsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new ValidationApiException({ file: ['Apenas arquivos de imagem são aceitos.'] }), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new ValidationApiException({ file: ['Arquivo obrigatório.'] });
    }

    // Deduzido da própria requisição (via "trust proxy" em main.ts) em vez de uma env var
    // fixa — funciona em qualquer host (local, Render, domínio próprio) sem configuração.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return {
      url: `${baseUrl}/uploads/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
