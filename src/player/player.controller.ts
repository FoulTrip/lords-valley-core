import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddItemDto, GodModeDto, SpawnAllowDto, StackIdDto, TrainDto } from './dto/player.dto';
import { PlayerService } from './player.service';

@ApiTags('player')
@ApiBearerAuth()
@Controller('player')
@UseGuards(JwtAuthGuard)
export class PlayerController {
  constructor(private readonly player: PlayerService) {}

  @Get('me/inventory')
  @ApiOperation({ summary: 'Inventario del jugador autenticado (estado servidor)' })
  inventory(@Request() req: { user: { id: string } }) {
    return this.player.getInventory(req.user.id);
  }

  @Post('me/inventory/add')
  @ApiOperation({ summary: 'Añadir item validado (nombre de catálogo o escuela de pergamino, cantidad 1-9)' })
  addItem(@Request() req: { user: { id: string } }, @Body() dto: AddItemDto) {
    return this.player.addItem(req.user.id, dto);
  }

  @Post('me/inventory/use')
  @ApiOperation({ summary: 'Usar 1 unidad de un stack (pergamino +XP; Pan +20 hambre; Odre con Agua +20 sed y deja Odre vacío)' })
  useItem(@Request() req: { user: { id: string } }, @Body() dto: StackIdDto) {
    return this.player.useItem(req.user.id, dto.stackId);
  }

  @Post('me/inventory/remove')
  @ApiOperation({ summary: 'Eliminar un stack del inventario' })
  removeItem(@Request() req: { user: { id: string } }, @Body() dto: StackIdDto) {
    return this.player.removeStack(req.user.id, dto.stackId);
  }

  @Get('me/skills')
  @ApiOperation({ summary: 'Habilidades del jugador autenticado (estado servidor)' })
  skills(@Request() req: { user: { id: string } }) {
    return this.player.getSkills(req.user.id);
  }

  @Get('me/needs')
  @ApiOperation({ summary: 'Hambre/sed del jugador (0=saciado, 100=hambriento; 100 en 5h). Aplica decaimiento por tiempo.' })
  needs(@Request() req: { user: { id: string } }) {
    return this.player.getNeeds(req.user.id);
  }

  @Post('me/skills/train')
  @ApiOperation({ summary: 'Entrenar escuela o habilidad (+10 XP, consume 1 pergamino en servidor)' })
  train(@Request() req: { user: { id: string } }, @Body() dto: TrainDto) {
    return this.player.train(req.user.id, dto);
  }

  @Get('me/dev')
  @ApiOperation({ summary: 'Estado dev del jugador (godMode)' })
  dev(@Request() req: { user: { id: string } }) {
    return this.player.getDev(req.user.id);
  }

  @Post('me/dev/godmode')
  @ApiOperation({ summary: 'Activa/desactiva GodMode (inmunidad validada por el servidor)' })
  godmode(@Request() req: { user: { id: string } }, @Body() dto: GodModeDto) {
    return this.player.setGodMode(req.user.id, dto.on);
  }

  @Post('me/dev/fullmode')
  @ApiOperation({ summary: 'FullMode: nivel máximo en las 48 habilidades del pentagrama' })
  fullmode(@Request() req: { user: { id: string } }) {
    return this.player.grantFullMode(req.user.id);
  }

  @Post('me/dev/spawn-allow')
  @ApiOperation({ summary: 'Valida un comando create/spawn de la consola antes de emitirlo a Phaser' })
  spawnAllow(@Body() dto: SpawnAllowDto) {
    return this.player.allowSpawn(dto.kind, dto.count);
  }
}
