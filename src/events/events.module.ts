import { Module } from '@nestjs/common';
import { GameEventGateway } from './game-event.gateway';
import { GameEventListener } from './game-event.listener';

@Module({
  providers: [GameEventGateway, GameEventListener],
  exports: [GameEventGateway],
})
export class EventsModule {}
