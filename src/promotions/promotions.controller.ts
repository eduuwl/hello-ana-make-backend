import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionQueryDto } from './dto/promotion-query.dto';
import { PromotionPreviewDto } from './dto/promotion-preview.dto';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  list(@Query() query: PromotionQueryDto) {
    return this.promotionsService.list(query);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: PromotionPreviewDto) {
    return this.promotionsService.preview(dto);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.promotionsService.getBySlug(slug);
  }
}
