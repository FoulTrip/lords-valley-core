import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SettlementRepository } from '../../settlement/services/settlement.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SimulationProcessor {
  private readonly logger = new Logger(SimulationProcessor.name);
  public readonly queue: Queue | null = null;
  private enabled = false;
  private readonly queueName = 'simulation-ticks';

  constructor(
    private readonly repository: SettlementRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn('REDIS_URL no definido — BullMQ deshabilitado, se usará fallback directo (sin Redis).');
      return;
    }
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || '127.0.0.1';
      const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
      const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
      const tls = parsed.protocol === 'rediss:' ? {} : undefined;

      const connection: any = {
        host,
        port,
        password,
        username: username || (password ? 'default' : undefined),
        tls,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectTimeout: 5000,
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      };
      // Limpiar undefined
      Object.keys(connection).forEach((k) => connection[k] === undefined && delete connection[k]);

      this.queue = new Queue(this.queueName, {
        connection,
      } as any);

      // Manejar errores sin spamear: solo warn la primera vez y deshabilitar
      this.queue.on('error' as any, (err: Error) => {
        if (this.enabled) {
          this.logger.warn(`BullMQ Queue error (deshabilitando BullMQ, fallback directo): ${err.message}`);
          this.enabled = false;
        }
      });
      this.enabled = true;
      this.logger.log(`BullMQ Queue inicializada hacia ${host}:${port} (REDIS_URL)`);
    } catch (e: any) {
      this.logger.warn(`REDIS_URL inválida (${e?.message}) — BullMQ deshabilitado, fallback directo.`);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && !!this.queue;
  }

  async addTick(settlementId: string, jobId?: string): Promise<boolean> {
    if (!this.isEnabled() || !this.queue) return false;
    try {
      await this.queue.add(jobId || `${settlementId}-${Date.now()}`, { settlementId }, {
        removeOnComplete: 20,
        removeOnFail: 20,
        attempts: 1,
      });
      return true;
    } catch (e: any) {
      if (this.enabled) {
        this.logger.warn(`BullMQ addTick falló (fallback directo): ${e?.message}`);
        this.enabled = false;
      }
      return false;
    }
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
    if (this.queue) {
      try {
        await this.queue.close();
      } catch {}
    }
  }
}