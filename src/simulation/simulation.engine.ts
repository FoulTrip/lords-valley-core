import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettlementRepository } from '../settlement/services/settlement.repository';

@Injectable()
export class SimulationEngine {
  private readonly logger = new Logger(SimulationEngine.name);
  private isRunning = false;

  constructor(
    private readonly repository: SettlementRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Interval(2000)
  async handleSimulationTick(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Simulation tick skipped: previous tick still running');
      return;
    }
    this.isRunning = true;
    const start = Date.now();
    try {
      const activeIds = await this.repository.findAllActiveIds();
      if (activeIds.length === 0) return;

      for (const id of activeIds) {
        try {
          const settlement = await this.repository.findById(id);
          if (!settlement) continue;

          settlement.executeTick();

          const events = settlement.pullEvents();
          for (const event of events) {
            this.eventEmitter.emit(event.type, event.payload);
          }

          if (settlement.isApproachingBsonLimit()) {
            this.logger.warn(
              `Settlement ${id} approaching BSON limit: ${settlement.getSizeEstimateBytes()} bytes`,
            );
            this.eventEmitter.emit('SETTLEMENT_BSON_WARNING', {
              settlementId: id,
              size: settlement.getSizeEstimateBytes(),
            });
          }

          await this.repository.save(settlement);
        } catch (err) {
          this.logger.error(`Tick failed for settlement ${id}`, (err as Error).stack);
        }
      }

      const elapsed = Date.now() - start;
      if (elapsed > 1500) {
        this.logger.warn(`Simulation tick took ${elapsed}ms for ${activeIds.length} settlements`);
      }
    } catch (error) {
      this.logger.error('Critical failure in simulation loop', (error as Error).stack);
    } finally {
      this.isRunning = false;
    }
  }
}
