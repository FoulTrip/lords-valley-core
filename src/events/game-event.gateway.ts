import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { JoinSettlementDto, ViewportDto, NpcConversationRequestDto, SurvivorConversationEventDto } from './dto/game-event.dto';
import { SettlementRepository } from '../settlement/services/settlement.repository';
import { NpcDialogueEngine } from '../settlement/domain/npc-dialogue.engine';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'game',
})
export class GameEventGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameEventGateway.name);
  private readonly pairCooldowns = new Map<string, number>();
  private readonly individualCooldowns = new Map<string, number>();

  constructor(
    @Optional() private readonly settlementRepository?: SettlementRepository,
  ) {}

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinSettlement')
  handleJoinSettlement(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinSettlementDto,
  ): void {
    if (!data?.settlementId) return;
    if (client.rooms.has(data.settlementId)) return;
    client.join(data.settlementId);
    this.logger.log(`Client ${client.id} joined room ${data.settlementId}`);
    client.emit('joinedSettlement', { settlementId: data.settlementId });
  }

  @SubscribeMessage('leaveSettlement')
  handleLeaveSettlement(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinSettlementDto,
  ): void {
    if (!data?.settlementId) return;
    client.leave(data.settlementId);
    this.logger.log(`Client ${client.id} left room ${data.settlementId}`);
  }

  @SubscribeMessage('updateViewport')
  handleUpdateViewport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ViewportDto,
  ): void {
    // Store viewport data on the client for later use
    // The settlementId is available from the client's rooms
    const settlementId = Array.from(client.rooms).find(
      (room) => room !== client.id
    );
    
    if (settlementId && data) {
      // Store viewport info - could also emit an event to notify other components
      this.logger.log(`Client ${client.id} updated viewport for ${settlementId}`);
    }
  }

  @SubscribeMessage('npc:conversation_request')
  async handleNpcConversationRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: NpcConversationRequestDto,
  ): Promise<void> {
    if (!data?.settlementId || !data?.initiatorId || !data?.targetId) return;
    if (data.initiatorId === data.targetId) return;

    const now = Date.now();
    const pairKey = [data.initiatorId, data.targetId].sort().join(':');
    const lastPairTime = this.pairCooldowns.get(pairKey) ?? 0;
    // Cooldown entre el mismo par de NPCs: mínimo 14 segundos
    if (now - lastPairTime < 14000) return;

    // Cooldown individual para que un NPC no hable sin parar: mínimo 6 segundos
    const lastInitTime = this.individualCooldowns.get(data.initiatorId) ?? 0;
    const lastTargetTime = this.individualCooldowns.get(data.targetId) ?? 0;
    if (now - lastInitTime < 6000 || now - lastTargetTime < 6000) return;

    let hourOfDay = 10;
    let weather = 'DESPEJADO';
    let season = 'PRIMAVERA';
    let sName = data.initiatorName;
    let tName = data.targetName;
    let sJob = data.initiatorJob;
    let tJob = data.targetJob;

    if (this.settlementRepository) {
      try {
        const domain = await this.settlementRepository.findById(data.settlementId);
        if (domain) {
          hourOfDay = domain.getGameTime() % 24;
          season = domain.getSeason();
          const survivors = domain.getSurvivors();
          const initSurvivor = survivors.find((s) => s.id === data.initiatorId);
          const targetSurvivor = survivors.find((s) => s.id === data.targetId);

          if (initSurvivor && !sName) {
            sName = `${initSurvivor.firstName} ${initSurvivor.lastName}`.trim();
          }
          if (targetSurvivor && !tName) {
            tName = `${targetSurvivor.firstName} ${targetSurvivor.lastName}`.trim();
          }
        }
      } catch (e: any) {
        this.logger.debug(`Could not query settlement for conversation context: ${e?.message}`);
      }
    }

    const exchange = NpcDialogueEngine.generateDialogue({
      initiatorName: sName || 'Compañero',
      initiatorJob: sJob || 'Trabajador',
      targetName: tName || 'Vecino',
      targetJob: tJob || 'Trabajador',
      hourOfDay,
      weather,
      season,
    });

    this.pairCooldowns.set(pairKey, now);
    this.individualCooldowns.set(data.initiatorId, now);
    this.individualCooldowns.set(data.targetId, now);

    const payload: SurvivorConversationEventDto = {
      settlementId: data.settlementId,
      dialogueId: randomUUID(),
      initiatorId: data.initiatorId,
      initiatorName: sName || 'Compañero',
      initiatorText: exchange.initiatorText,
      targetId: data.targetId,
      targetName: tName || 'Vecino',
      responderText: exchange.responderText,
      topic: exchange.topic,
      replyDelayMs: exchange.replyDelayMs,
      durationMs: exchange.durationMs,
    };

    this.logger.log(
      `[Conversation] ${payload.initiatorName} -> ${payload.targetName} (${payload.topic}): "${payload.initiatorText}"`,
    );

    this.server.to(data.settlementId).emit('SURVIVOR_CONVERSATION', payload);
  }

  emitToSettlement(settlementId: string, event: string, payload: unknown): void {
    this.server.to(settlementId).emit(event, payload);
  }

  emitDeltaToSettlement(settlementId: string, event: string, payload: unknown): void {
    this.server.to(settlementId).emit(event, payload);
  }
}