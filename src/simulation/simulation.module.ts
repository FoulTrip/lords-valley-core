import { Module } from '@nestjs/common';
import { SettlementModule } from '../settlement/settlement.module';
import { SimulationEngine } from './simulation.engine';

@Module({
  imports: [SettlementModule],
  providers: [SimulationEngine],
})
export class SimulationModule {}
