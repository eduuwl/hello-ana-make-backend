import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe, Req } from '@nestjs/common';
import { Request } from 'express';
import { ProductsService } from './products.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { OptionalAuthService } from '../common/auth/optional-auth.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly optionalAuth: OptionalAuthService,
  ) {}

  @Get()
  async list(@Req() req: Request, @Query() query: ProductQueryDto) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.productsService.list(query, { userId: user?.id });
  }

  @Get(':slug')
  async getBySlug(@Req() req: Request, @Param('slug') slug: string) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.productsService.getBySlug(slug, { userId: user?.id });
  }

  @Get(':id/related')
  async getRelated(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(8), ParseIntPipe) limit: number,
  ) {
    const user = await this.optionalAuth.getUserFromRequest(req);
    return this.productsService.getRelated(id, limit, user?.id);
  }
}
