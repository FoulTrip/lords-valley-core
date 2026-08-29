import { Module } from '@nestjs/common';
import { SettlementModule } from '../settlement/settlement.module';
import { SimulationEngine } from './SimulationEngine';
import { SimulationProcessor } from './processor/SimulationProcessor';

@Module({
  imports: [SettlementModule],
  providers: [SimulationEngine, SimulationProcessor],
})
export class SimulationModule {}
