import { Module } from '@nestjs/common';
import { CombatService } from './combat.service';
import { CombatGateway } from './combat.gateway';
import { SettlementModule } from '../settlement/settlement.module';

@Module({
  imports: [SettlementModule],
  providers: [CombatService, CombatGateway],
  exports: [CombatService],
})
export class CombatModule {}
