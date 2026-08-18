import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { FavoritesQueryDto } from './dto/favorites-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: FavoritesQueryDto) {
    return this.favoritesService.list(user, query);
  }

  @Get('ids')
  async getIds(@CurrentUser() user: AuthenticatedUser) {
    return { ids: await this.favoritesService.getIds(user.id) };
  }

  @Get(':productId/check')
  async check(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return { isFavorite: await this.favoritesService.has(user.id, productId) };
  }

  @Post(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async add(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    await this.favoritesService.add(user.id, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    await this.favoritesService.remove(user.id, productId);
  }
}
