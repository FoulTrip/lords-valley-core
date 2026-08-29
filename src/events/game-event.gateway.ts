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
import { Logger } from '@nestjs/common';
import type { JoinSettlementDto } from './dto/game-event.dto';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'game',
})
export class GameEventGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameEventGateway.name);

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

  emitToSettlement(settlementId: string, event: string, payload: unknown): void {
    this.server.to(settlementId).emit(event, payload);
  }

  broadcast(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }
}
