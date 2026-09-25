import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CombatService, type FighterLoadout } from './combat.service';
import { getEquipmentStats, getWeaponStats } from '../player/item-catalog';
import { SettlementRepository } from '../settlement/services/settlement.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  SpawnGhostDto,
  GhostDamageDto,
  PlayerAttackedDto,
  CombatHitDto,
  RespawnDto,
} from './dto/ghost.dto';

/**
 * CombatGateway — WebSocket namespace `/combat`.
 *
 * El servidor es la autoridad de daño:
 *  - Los clientes REPORTAN que quieren hacer daño (el servidor valida y confirma o rechaza).
 *  - El daño al jugador sólo se confirma cuando el servidor valida distancia y cooldown.
 *  - El modo creativo lo controla el servidor (no window.__CREATIVE_MODE__).
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'combat',
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class CombatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CombatGateway.name);
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly combatService: CombatService,
    private readonly settlementRepository: SettlementRepository,
    private readonly prisma: PrismaService,
  ) {}

  /** Tick de efectos (hemorragia/quemadura/frío/HoT) cada 1s; difunde HP y muertes. */
  onModuleInit(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      try {
        const events = this.combatService.tickEffects(Date.now());
        for (const ev of events) {
          if (ev.targetKind === 'ghost') {
            this.server.to(ev.settlementId).emit('ghost:damage_result', {
              ghostId: ev.targetId, applied: true, newHp: ev.hp, isDead: ev.dead,
            });
            if (ev.diedThisTick) {
              this.server.to(ev.settlementId).emit('ghost:died', { ghostId: ev.targetId });
            }
          } else {
            this.server.to(ev.settlementId).emit('combat:dot_tick', {
              targetId: ev.targetId, targetKind: ev.targetKind,
              hp: ev.hp, maxHp: ev.maxHp, dead: ev.dead, slowMovePct: ev.slowMovePct,
            });
            if (ev.diedThisTick) {
              this.server.to(ev.settlementId).emit('combat:died', {
                targetId: ev.targetId, targetKind: ev.targetKind, settlementId: ev.settlementId,
              });
            }
          }
        }
      } catch (err) {
        this.logger.warn(`[Combat] tickEffects falló: ${(err as Error)?.message ?? err}`);
      }
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * Carga el loadout persistido del dueño del settlement (equipo + bonus de
   * elixir + buffs vigentes). Es la vía autoritativa para el atacante o
   * defensor player: el cliente nunca decide estos valores.
   */
  private async loadOwnerLoadout(settlementId: string): Promise<FighterLoadout | undefined> {
    try {
      if (!settlementId) return undefined;
      const settlement = await this.settlementRepository.findById(settlementId);
      const ownerId = (settlement as any)?.rawData?.ownerId as string | undefined;
      if (!ownerId) return undefined;
      const player = await this.prisma.player.findUnique({ where: { id: ownerId } });
      const game = (player?.settings as Record<string, unknown> | null)?.game as
        | { equipment?: Record<string, unknown>; damageBonus?: unknown; buffs?: unknown }
        | undefined;
      if (!game || typeof game !== 'object') return undefined;
      const eq = (game.equipment ?? {}) as Record<string, unknown>;
      const now = Date.now();
      const useSecond = eq?.activeWeapon === 2;
      const activeWeaponName = useSecond ? eq?.weapon2 : eq?.weapon;
      const activeWeaponCalidad = useSecond ? eq?.weapon2Calidad : eq?.weaponCalidad;
      const weapon = typeof activeWeaponName === 'string' && getWeaponStats(activeWeaponName)
        ? activeWeaponName
        : null;
      const weaponCalidad = typeof activeWeaponCalidad === 'string'
        ? activeWeaponCalidad
        : 'comun';
      // Todos los slots de equipo se validan contra el catálogo (nombres),
      // igual que el arma y la armadura; lo inválido se ignora (null).
      const equip = (key: string): string | null => {
        const v = eq?.[key];
        return typeof v === 'string' && getEquipmentStats(v) ? v : null;
      };
      const equipCalidad = (key: string): string => {
        const v = eq?.[`${key}Calidad`];
        return typeof v === 'string' ? v : 'comun';
      };
      const damageBonus = typeof game.damageBonus === 'number' && game.damageBonus > 0
        ? Math.floor(game.damageBonus)
        : 0;
      const buffs = Array.isArray(game.buffs)
        ? game.buffs.filter(
            (b): b is { kind: 'resist_fire' | 'resist_cold' | 'immune_negative' | 'immune_burn' | 'hot' | 'attack_slow' | 'move_slow' | 'damage_boost' | 'invisible'; value: number; expiresAt: number } =>
              !!b && typeof b === 'object' &&
              typeof (b as any).expiresAt === 'number' && (b as any).expiresAt > now &&
              typeof (b as any).value === 'number',
          )
        : [];
      return {
        weapon, weaponCalidad,
        armor: equip('armor'), armorCalidad: equipCalidad('armor'),
        helmet: equip('helmet'), helmetCalidad: equipCalidad('helmet'),
        boots: equip('boots'), bootsCalidad: equipCalidad('boots'),
        gloves: equip('gloves'), glovesCalidad: equipCalidad('gloves'),
        shield: equip('shield'), shieldCalidad: equipCalidad('shield'),
        necklace: equip('necklace'), necklaceCalidad: equipCalidad('necklace'),
        ring: equip('ring'), ringCalidad: equipCalidad('ring'),
        cape: equip('cape'), capeCalidad: equipCalidad('cape'),
        damageBonus, buffs,
      };
    } catch {
      return undefined;
    }
  }

  handleConnection(client: Socket): void {
    this.logger.log(`[Combat] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`[Combat] Client disconnected: ${client.id}`);
  }

  /**
   * El cliente solicita spawnear ghosts.
   * El servidor genera los ghosts con IDs UUID reales y los broadcast al settlement room.
   *
   * Emite: `ghost:spawned` con array de GhostStateDto
   */
  @SubscribeMessage('ghost:spawn_request')
  async handleGhostSpawnRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SpawnGhostDto,
  ): Promise<void> {
    if (!dto?.settlementId) {
      client.emit('combat:error', { message: 'settlementId requerido' });
      return;
    }

    const count = Math.max(1, Math.min(3, dto.count ?? 1));
    // Base sugerida por el cliente (aleatoria en el mapa); el servidor la acota
    // y dispersa alrededor — la posición final siempre es autoritativa.
    const base = typeof dto.baseX === 'number' && typeof dto.baseY === 'number'
      ? { x: dto.baseX, y: dto.baseY }
      : undefined;
    const ghosts = this.combatService.spawnGhosts(dto.settlementId, count, base);

    // Hacer broadcast a todos en el settlement room (incluyendo al solicitante)
    this.server.to(dto.settlementId).emit('ghost:spawned', { ghosts, settlementId: dto.settlementId });

    this.logger.log(`[Combat] ${ghosts.length} ghost(s) spawned for settlement ${dto.settlementId}`);
  }

  /**
   * Unirse al room del settlement para recibir eventos de combate.
   */
  @SubscribeMessage('combat:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { settlementId: string },
  ): void {
    if (!data?.settlementId) return;
    if (!client.rooms.has(data.settlementId)) {
      client.join(data.settlementId);
    }
    // Enviar ghosts activos al cliente recién conectado
    const activeGhosts = this.combatService.getActiveGhosts(data.settlementId);
    client.emit('ghost:active_list', { ghosts: activeGhosts, settlementId: data.settlementId });
    this.logger.log(`[Combat] Client ${client.id} joined settlement room ${data.settlementId}, ${activeGhosts.length} active ghosts`);
  }

  /**
   * El cliente reporta que atacó a un ghost.
   * El servidor valida (distancia, cooldown, daño) y confirma o rechaza.
   *
   * Emite al mismo cliente: `ghost:damage_result` con GhostDamageResultDto
   * Si el ghost muere, broadcast a todos: `ghost:died`
   */
  @SubscribeMessage('ghost:damage')
  async handleGhostDamage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: GhostDamageDto,
  ): Promise<void> {
    // Loadout autoritativo del dueño (arma/daño persistidos); el arma
    // reportada solo se usa si no hay equipo persistido (survivors).
    let attackerLoadout = dto.settlementId ? await this.loadOwnerLoadout(dto.settlementId) : undefined;
    const result = this.combatService.applyDamageToGhost(
      dto.ghostId,
      dto.amount,
      dto.attackerId,
      dto.attackerX,
      dto.attackerY,
      { weapon: attackerLoadout?.weapon ?? dto.weapon ?? null, attackerLoadout },
    );

    // Respuesta al atacante
    client.emit('ghost:damage_result', result);

    if (result.applied && result.isDead) {
      // Broadcast de muerte del ghost a todos en el room
      const settlementRoom = Array.from(client.rooms).find(r => r !== client.id);
      if (settlementRoom) {
        this.server.to(settlementRoom).emit('ghost:died', { ghostId: dto.ghostId });
      }
    }
  }

  /**
   * El cliente reporta que un ghost intentó atacar al jugador.
   * El servidor valida (distancia, cooldown, modo creativo) y decide si aplicar el daño.
   *
   * Emite: `player:damage_applied` si se aprueba, sólo al jugador objetivo
   * El cliente NO aplica daño hasta recibir esta confirmación.
   */
  @SubscribeMessage('player:attacked')
  async handlePlayerAttacked(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: PlayerAttackedDto,
  ): Promise<void> {
    // Obtener el gameMode autoritativo del servidor
    let gameMode = 'survival';
    let godMode = false;
    try {
      const settlement = await this.settlementRepository.findById(dto.settlementId);
      gameMode = (settlement as any)?.rawData?.gameMode ?? 'survival';
      // GodMode del dueño del settlement (POST /player/me/dev/godmode)
      const ownerId = (settlement as any)?.rawData?.ownerId as string | undefined;
      if (ownerId) {
        const player = await this.prisma.player.findUnique({ where: { id: ownerId } });
        const game = (player?.settings as Record<string, unknown> | null)?.game as
          | { dev?: { godMode?: unknown } }
          | undefined;
        godMode = game?.dev?.godMode === true;
      }
    } catch {
      // Si falla la consulta, asumir survival sin godmode (más seguro)
    }

    const result = this.combatService.processGhostAttackPlayer(
      dto.ghostId,
      dto.targetId,
      dto.ghostX,
      dto.ghostY,
      dto.targetX,
      dto.targetY,
      dto.settlementId,
      gameMode,
      godMode,
      await this.loadOwnerLoadout(dto.settlementId),
    );

    // Enviar resultado al cliente que reportó (es el mismo jugador afectado)
    client.emit('player:damage_result', result);
  }

  /**
   * Golpe genérico (player/survivor/dead-dragon/ghost contra cualquiera).
   * El servidor valida kinds, distancia y cooldown, y decreta daño y muerte.
   *
   * Emite al reportante: `combat:hit_result`.
   * Si el objetivo muere, broadcast al room: `combat:died`.
   */
  @SubscribeMessage('combat:hit')
  async handleCombatHit(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CombatHitDto,
  ): Promise<void> {
    // Vía autoritativa para el player (atacante o defensor): equipo, bonus
    // de elixir y buffs persistidos del dueño. Survivors/dragones/ghosts usan
    // sus valores canónicos (+ arma validada si la reportan).
    const attackerLoadout = dto.attackerKind === 'player'
      ? await this.loadOwnerLoadout(dto.settlementId)
      : undefined;
    const defenderLoadout = dto.targetKind === 'player'
      ? (dto.attackerKind === 'player' ? attackerLoadout : await this.loadOwnerLoadout(dto.settlementId))
      : undefined;
    const result = this.combatService.applyCombatHit({
      attackerId: dto.attackerId,
      attackerKind: dto.attackerKind,
      targetId: dto.targetId,
      targetKind: dto.targetKind,
      attackerX: dto.attackerX,
      attackerY: dto.attackerY,
      targetX: dto.targetX,
      targetY: dto.targetY,
      settlementId: dto.settlementId,
      amount: dto.amount,
      weapon: attackerLoadout?.weapon ?? dto.weapon ?? null,
      attackerLoadout,
      defenderLoadout,
    });

    client.emit('combat:hit_result', { ...result, targetKind: dto.targetKind });

    if (result.applied && result.isDead) {
      const died = { targetId: dto.targetId, targetKind: dto.targetKind, settlementId: dto.settlementId };
      if (dto.settlementId) {
        this.server.to(dto.settlementId).emit('combat:died', died);
      } else {
        client.emit('combat:died', died);
      }
    }
  }

  /**
   * El cliente avisa que una entidad reapareció (respawn del player).
   * El servidor restaura su HP a lleno.
   *
   * Emite al reportante: `player:respawned` con el HP restaurado.
   */
  @SubscribeMessage('player:respawn')
  async handleRespawn(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: RespawnDto,
  ): Promise<void> {
    const valid = ['player', 'survivor', 'dead-dragon', 'ghost'].includes(dto.kind);
    if (!valid) return;
    const res = this.combatService.respawnEntity(
      dto.entityId,
      dto.kind as 'player' | 'survivor' | 'dead-dragon' | 'ghost',
      dto.settlementId,
    );
    client.emit('player:respawned', res);
  }

  /**
   * El cliente actualiza la posición de un ghost para que el servidor la registre.
   * Esto permite validaciones de distancia más precisas.
   */
  @SubscribeMessage('ghost:position_update')
  handleGhostPositionUpdate(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { ghostId: string; x: number; y: number },
  ): void {
    if (!data?.ghostId) return;
    this.combatService.updateGhostPosition(data.ghostId, data.x, data.y);
  }
}
