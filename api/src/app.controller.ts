import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPublic } from './core/swagger/api-public.decorator';
import { AppService } from './app.service';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiPublic()
  @Get()
  getHealth(): string {
    return this.appService.getHealth();
  }
}
