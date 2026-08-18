import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateStoreSettingsDto } from './dto/update-settings.dto';
import { UpdateIntegrationsDto } from './dto/update-integrations.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SettingsAdminController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAdmin() {
    return this.settingsService.getAdmin();
  }

  @Put()
  update(@Body() dto: UpdateStoreSettingsDto) {
    return this.settingsService.update(dto);
  }

  @Patch('integrations')
  updateIntegrations(@Body() dto: UpdateIntegrationsDto) {
    return this.settingsService.updateIntegrations(dto);
  }
}
