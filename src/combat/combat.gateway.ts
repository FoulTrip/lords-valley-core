import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CombatService } from './combat.service';
import { SettlementRepository } from '../settlement/services/settlement.repository';
import {
  SpawnGhostDto,
  GhostDamageDto,
  PlayerAttackedDto,
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
export class CombatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CombatGateway.name);

  constructor(
    private readonly combatService: CombatService,
    private readonly settlementRepository: SettlementRepository,
  ) {}

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
    const ghosts = this.combatService.spawnGhosts(dto.settlementId, count);

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
    const result = this.combatService.applyDamageToGhost(
      dto.ghostId,
      dto.amount,
      dto.attackerId,
      dto.attackerX,
      dto.attackerY,
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
    try {
      const settlement = await this.settlementRepository.findById(dto.settlementId);
      gameMode = (settlement as any)?.rawData?.gameMode ?? 'survival';
    } catch {
      // Si falla la consulta, asumir survival (más seguro)
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
    );

    // Enviar resultado al cliente que reportó (es el mismo jugador afectado)
    client.emit('player:damage_result', result);
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
