import { Controller, Get } from '@nestjs/common';
import { InstagramService } from './instagram.service';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('feed')
  async getFeed() {
    const items = await this.instagramService.getRecentMedia(6);
    return { items };
  }
}
