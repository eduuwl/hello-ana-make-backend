import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { UpsertPromotionDto } from './dto/upsert-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PromotionsAdminController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  list(@Query() pagination: PaginationQueryDto) {
    return this.promotionsService.adminList(pagination);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: UpsertPromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.promotionsService.remove(id);
  }
}
