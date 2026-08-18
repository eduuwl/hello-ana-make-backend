import { Controller, HttpCode, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
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
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new ValidationApiException({ file: ['Arquivo obrigatório.'] });
    }

    const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8000}`;
    return {
      url: `${baseUrl}/uploads/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
