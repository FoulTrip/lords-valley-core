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
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';

// Observe telemetry desactivado en dev: 401 con placeholder YOUR_APP_KEY (ver logs). Activar solo con env OBSERVE_APP_KEY real.
// import { createObserveModule } from '@nestjs/observe';
// export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // ObserveModule.forRoot({ appKey: process.env.OBSERVE_APP_KEY!, appSecret: process.env.OBSERVE_APP_SECRET!, serviceId: 'lordsvalley-core' }),
    PrismaModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    AuthModule,
    SettlementModule,
    SimulationModule,
    EventsModule,
    MapChunksModule,
    CombatModule,
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
