import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { UpsertRewardTierDto } from './dto/upsert-reward-tier.dto';
import { UpdateRewardTierDto } from './dto/update-reward-tier.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/reward-tiers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RewardsAdminController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  list(@Query() pagination: PaginationQueryDto) {
    return this.rewardsService.adminList(pagination);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: UpsertRewardTierDto) {
    return this.rewardsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRewardTierDto) {
    return this.rewardsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.rewardsService.remove(id);
  }
}
