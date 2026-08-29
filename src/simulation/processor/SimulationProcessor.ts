import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SettlementRepository } from '../../settlement/services/settlement.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';

export class SimulationProcessor {
  private readonly logger = new Logger(SimulationProcessor.name);
  public readonly queue: Queue;

  constructor(
    private readonly repository: SettlementRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly queueName: string = 'simulation-ticks',
  ) {
    this.queue = new Queue(this.queueName, {
      connection: { host: 'localhost', port: 6379 },
    });
  }

  async addTick(settlementId: string, jobId?: string): Promise<void> {
    await this.queue.add(jobId || `${settlementId}-${Date.now()}`, { settlementId });
  }

  async processJob(job: { data: { settlementId: string } }): Promise<void> {
    const { settlementId } = job.data;

    const domain = await this.repository.findById(settlementId);
    if (!domain) {
      this.logger.warn(`Settlement ${settlementId} not found during tick`);
      return;
    }

    domain.executeTick();

    const events = domain.pullEvents();
    for (const event of events) {
      this.eventEmitter.emit(event.type, event.payload);
    }

    await this.repository.save(domain);
    this.logger.debug(`Tick processed for settlement ${settlementId}`);
  }

  async closeQueue(): Promise<void> {
    await this.queue.close();
  }
}