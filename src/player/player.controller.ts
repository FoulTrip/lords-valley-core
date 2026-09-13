import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddItemDto, StackIdDto, TrainDto } from './dto/player.dto';
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
  @ApiOperation({ summary: 'Usar 1 unidad de un stack (pergamino aplica +XP en servidor)' })
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

  @Post('me/skills/train')
  @ApiOperation({ summary: 'Entrenar escuela o habilidad (+10 XP, consume 1 pergamino en servidor)' })
  train(@Request() req: { user: { id: string } }, @Body() dto: TrainDto) {
    return this.player.train(req.user.id, dto);
  }
}
