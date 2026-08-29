import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GameEventGateway } from './game-event.gateway';
import type { SurvivorLoyaltyChangedDto, ResourceExtractedDto } from './dto/game-event.dto';

@Injectable()
export class GameEventListener {
  private readonly logger = new Logger(GameEventListener.name);

  constructor(private readonly gateway: GameEventGateway) {}

  @OnEvent('SURVIVOR_LOYALTY_CHANGED')
  handleLoyaltyChanged(payload: SurvivorLoyaltyChangedDto): void {
    this.logger.debug(`Loyalty changed: ${payload.survivorId} -> ${payload.loyalty}`);
    this.gateway.emitToSettlement(payload.settlementId, 'SURVIVOR_LOYALTY_CHANGED', payload);
  }

  @OnEvent('RESOURCE_EXTRACTED')
  handleResourceExtracted(payload: ResourceExtractedDto): void {
    this.gateway.emitToSettlement(payload.settlementId, 'RESOURCE_EXTRACTED', payload);
  }

  @OnEvent('SETTLEMENT_PRIORITIES_CHANGED')
  handlePrioritiesChanged(payload: { settlementId: string }): void {
    this.gateway.emitToSettlement(payload.settlementId, 'SETTLEMENT_PRIORITIES_CHANGED', payload);
  }

  @OnEvent('SETTLEMENT_BSON_WARNING')
  handleBsonWarning(payload: { settlementId: string; size: number }): void {
    this.logger.warn(`BSON warning for ${payload.settlementId}: ${payload.size} bytes`);
    this.gateway.emitToSettlement(payload.settlementId, 'SETTLEMENT_BSON_WARNING', payload);
  }

  @OnEvent('SETTLEMENT_TICK_COMPLETED')
  handleTickCompleted(payload: { settlementId: string; gameTime: number }): void {
    this.gateway.emitToSettlement(payload.settlementId, 'SETTLEMENT_TICK_COMPLETED', payload);
  }
}
