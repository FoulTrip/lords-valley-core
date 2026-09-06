import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Healthcheck', description: 'Verifica que el monolito está vivo' })
  @ApiResponse({ status: 200, description: 'Mensaje de bienvenida', type: String })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck alternativo', description: 'Para probes de frontend (StartScreen)' })
  getHealth(): { status: string; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }
}
