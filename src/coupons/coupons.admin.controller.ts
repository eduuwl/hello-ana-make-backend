import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { UpsertCouponDto } from './dto/upsert-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CouponsAdminController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  list(@Query() pagination: PaginationQueryDto) {
    return this.couponsService.adminList(pagination);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: UpsertCouponDto) {
    return this.couponsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.couponsService.remove(id);
  }
}
