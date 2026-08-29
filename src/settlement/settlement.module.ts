import { Module } from '@nestjs/common';
import { SettlementController } from './controllers/settlement.controller';
import { SettlementService } from './services/settlement.service';
import { SettlementRepository } from './services/settlement.repository';

@Module({
  controllers: [SettlementController],
  providers: [SettlementService, SettlementRepository],
  exports: [SettlementService, SettlementRepository],
})
export class SettlementModule {}
