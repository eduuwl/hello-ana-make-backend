import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { UpsertBrandDto } from './dto/upsert-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/brands')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class BrandsAdminController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  list(@Query() pagination: PaginationQueryDto) {
    return this.brandsService.adminList(pagination);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: UpsertBrandDto) {
    return this.brandsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.brandsService.remove(id);
  }
}
