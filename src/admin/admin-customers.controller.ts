import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminCustomersService } from './admin-customers.service';
import { CustomersQueryDto } from './dto/customers-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCustomersController {
  constructor(private readonly customersService: AdminCustomersService) {}

  @Get()
  list(@Query() query: CustomersQueryDto) {
    return this.customersService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.customersService.getById(id);
  }
}
