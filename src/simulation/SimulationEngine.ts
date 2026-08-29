import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SimulationProcessor } from './processor/SimulationProcessor';
import { SettlementRepository } from '../settlement/services/settlement.repository';

@Injectable()
export class SimulationEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationEngine.name);
  private isRunning = false;
  private tickCounter = 0;

  constructor(
    private readonly settlementRepository: SettlementRepository,
    private readonly simulationProcessor: SimulationProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('SimulationEngine: inicializado, distribuyendo ticks cada 100ms a BullMQ');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('SimulationEngine: shutdown complete');
    await this.simulationProcessor.closeQueue();
  }

  /**
   * Distribuye los ticks de simulación a la cola BullMQ cada 100ms.
   * Esto evita bloquear el event loop principal de NestJS.
   * Cada job es procesado de forma independiente por SimulationProcessor.
   */
  @Interval(100)
  async distributeTicks(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    try {
      // Usar el repositorio para obtener IDs (igual que el engine original)
      const activeSettlementIds = await this.settlementRepository.findAllActiveIds();

      if (activeSettlementIds.length === 0) {
        return;
      }

      // Adicionar un job por cada asentamiento a la cola
      // Usar jobId único: settlementId-tickCounter para evitar duplicados
      for (const settlementId of activeSettlementIds) {
        const jobId = `${settlementId}-${this.tickCounter}`;
        
        await this.simulationProcessor.addTick(settlementId, jobId);
      }

      this.tickCounter = (this.tickCounter + 1) % 10000; // evitar overflow
    } catch (error) {
      this.logger.error('Error distributing simulation ticks', (error as Error).stack);
    } finally {
      this.isRunning = false;
    }
  }
}