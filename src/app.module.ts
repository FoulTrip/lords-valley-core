import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SettlementModule } from './settlement/settlement.module';
import { SimulationModule } from './simulation/simulation.module';
import { EventsModule } from './events/events.module';
import { MapChunksModule } from './map-chunks/map-chunks.module';
import { AuthModule } from './auth/auth.module';
import { CombatModule } from './combat/combat.module';
import { PlayerModule } from './player/player.module';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    AuthModule,
    SettlementModule,
    SimulationModule,
    EventsModule,
    MapChunksModule,
    CombatModule,
    PlayerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: BigIntSerializerInterceptor,
    },
  ],
})
export class AppModule {}
