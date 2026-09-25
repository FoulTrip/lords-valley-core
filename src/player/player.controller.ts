import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveWeaponDto, AddItemDto, ConsumeItemDto, EquipDto, GodModeDto, SpawnAllowDto, StackIdDto, TrainDto, UnequipDto, UseItemDto } from './dto/player.dto';
import { PlayerService, type EquipSlot } from './player.service';

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
  @ApiOperation({ summary: 'Usar 1 unidad de un stack (comida=salud/saciedad, pociones/vendas, pergaminos de área con x/y/settlementId)' })
  useItem(@Request() req: { user: { id: string } }, @Body() dto: UseItemDto) {
    return this.player.useItem(req.user.id, dto);
  }

  @Post('me/inventory/remove')
  @ApiOperation({ summary: 'Eliminar un stack del inventario' })
  removeItem(@Request() req: { user: { id: string } }, @Body() dto: StackIdDto) {
    return this.player.removeStack(req.user.id, dto.stackId);
  }

  @Post('me/inventory/consume')
  @ApiOperation({ summary: 'Consume N unidades por nombre (Fertilizante para fertilizar, etc.)' })
  consumeItem(@Request() req: { user: { id: string } }, @Body() dto: ConsumeItemDto) {
    return this.player.consumeByNameInput(req.user.id, dto);
  }

  @Get('me/equipment')
  @ApiOperation({ summary: 'Equipo del jugador (armas + armadura, casco, botas, guantes, escudo, collar, anillo, capa)' })
  equipment(@Request() req: { user: { id: string } }) {
    return this.player.getEquipment(req.user.id);
  }

  @Get('me/buffs')
  @ApiOperation({ summary: 'Buffs temporizados vigentes del jugador (furia, invisibilidad, tónico...)' })
  buffs(@Request() req: { user: { id: string } }) {
    return this.player.getBuffs(req.user.id);
  }

  @Post('me/equipment/equip')
  @ApiOperation({ summary: 'Equipa un arma (arma1/arma2) o equipo (armadura, casco, botas, guantes, escudo, collar, anillo, capa) desde un stack' })
  equip(@Request() req: { user: { id: string } }, @Body() dto: EquipDto) {
    return this.player.equipItem(req.user.id, dto.stackId, dto.slot);
  }

  @Post('me/equipment/unequip')
  @ApiOperation({ summary: 'Desequipa un slot ("arma1", "arma2", "armadura", "casco", "botas", "guantes", "escudo", "collar", "anillo", "capa") al inventario' })
  unequip(@Request() req: { user: { id: string } }, @Body() dto: UnequipDto) {
    return this.player.unequipSlot(req.user.id, dto.slot as EquipSlot);
  }

  @Post('me/equipment/active-weapon')
  @ApiOperation({ summary: 'Elige el arma activa en combate ("arma1" o "arma2", teclas 1/2)' })
  activeWeapon(@Request() req: { user: { id: string } }, @Body() dto: ActiveWeaponDto) {
    return this.player.setActiveWeapon(req.user.id, dto.slot);
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
