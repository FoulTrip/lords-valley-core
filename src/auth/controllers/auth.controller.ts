import { Controller, Post, Get, Patch, Param, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { RegisterDto, LoginDto } from '../dto/register.dto';

@ApiTags('auth')
@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true }))
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar Player' })
  @ApiResponse({ status: 201, description: 'JWT emitido' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.username, dto.password);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login Player' })
  @ApiResponse({ status: 200, description: 'JWT emitido' })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('player/:id')
  @ApiOperation({ summary: 'Obtener Player por ID (core, sin mock)', description: 'Retorna Player real de DB (sin passwordHash) cargado en seed' })
  @ApiResponse({ status: 200, description: 'Player encontrado' })
  async getPlayer(@Param('id') id: string) {
    const player = await this.auth.findById(id);
    if (!player) return { error: 'Player no encontrado' };
    return player;
  }

  @Patch('player/:id/pos')
  @ApiOperation({ summary: 'Guardar última posición del Player para retomar donde quedó', description: 'Persiste settings.lastPos {x,y} para relogin' })
  async savePos(@Param('id') id: string, @Body() body: { x: number; y: number }) {
    return this.auth.updateLastPos(id, { x: body.x, y: body.y });
  }

  @Patch('player/:id/settings')
  @ApiOperation({ summary: 'Actualizar settings del Player' })
  async updateSettings(@Param('id') id: string, @Body() body: { settings: any }) {
    return this.auth.updateSettings(id, body.settings);
  }
}
