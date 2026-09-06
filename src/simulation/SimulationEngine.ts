import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SimulationProcessor } from './processor/SimulationProcessor';
import { SettlementRepository } from '../settlement/services/settlement.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SimulationEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationEngine.name);
  private isRunning = false;
  private tickCounter = 0;

  constructor(
    private readonly settlementRepository: SettlementRepository,
    private readonly simulationProcessor: SimulationProcessor,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    const mode = this.simulationProcessor.isEnabled() ? 'BullMQ' : 'directo (fallback sin Redis)';
    this.logger.log(`SimulationEngine: inicializado, modo ${mode}, tick cada 2000ms`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('SimulationEngine: shutdown complete');
    await this.simulationProcessor.closeQueue();
  }

  /**
   * Distribuye los ticks de simulación cada 2000ms.
   * Si BullMQ está disponible, encola jobs; si no, ejecuta ticks directos en memoria (fallback).
   * Esto evita bloquear el event loop y no spamea Redis cuando está caído.
   */
  @Interval(2000)
  async distributeTicks(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    try {
      const activeSettlementIds = await this.settlementRepository.findAllActiveIds();

      if (activeSettlementIds.length === 0) {
        return;
      }

      const useQueue = this.simulationProcessor.isEnabled();
      let queued = 0;
      let direct = 0;

      for (const settlementId of activeSettlementIds) {
        const jobId = `${settlementId}-${this.tickCounter}`;

        if (useQueue) {
          const ok = await this.simulationProcessor.addTick(settlementId, jobId);
          if (ok) {
            queued += 1;
            continue;
          }
          // si BullMQ falló, caer a directo para este y siguientes
        }

        // Fallback directo: ejecutar tick inline sin cola
        try {
          const domain = await this.settlementRepository.findById(settlementId);
          if (!domain) continue;
          domain.executeTick();
          const events = domain.pullEvents();
          for (const e of events) this.eventEmitter.emit(e.type, e.payload);
          if (domain.isApproachingBsonLimit()) {
            this.eventEmitter.emit('SETTLEMENT_BSON_WARNING', {
              settlementId,
              size: domain.getSizeEstimateBytes(),
            });
          }
          await this.settlementRepository.save(domain);
          direct += 1;
        } catch (e: any) {
          this.logger.error(`Error tick directo ${settlementId}: ${e?.message}`, e?.stack);
        }
      }

      if (queued > 0 || direct > 0) {
        this.logger.debug(`Ticks distribuidos tick#${this.tickCounter}: ${queued} vía BullMQ, ${direct} directo (total ${activeSettlementIds.length})`);
      }

      this.tickCounter = (this.tickCounter + 1) % 10000; // evitar overflow
    } catch (error) {
      this.logger.error('Error distributing simulation ticks', (error as Error).stack);
    } finally {
      this.isRunning = false;
    }
  }
}