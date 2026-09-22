import { Module } from '@nestjs/common';
import { GameEventGateway } from './game-event.gateway';
import { GameEventListener } from './game-event.listener';
import { SettlementModule } from '../settlement/settlement.module';

@Module({
  imports: [SettlementModule],
  providers: [GameEventGateway, GameEventListener],
  exports: [GameEventGateway],
})
export class EventsModule {}
