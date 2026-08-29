import { Injectable, NotFoundException } from '@nestjs/common';
import { SettlementRepository } from './settlement.repository';
import { CreateSettlementDto } from '../dto/create-settlement.dto';
import { UpdatePrioritiesDto } from '../dto/update-priorities.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { plainToInstance } from 'class-transformer';
import { SettlementResponseDto } from '../dto/settlement-response.dto';

@Injectable()
export class SettlementService {
  constructor(
    private readonly repository: SettlementRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateSettlementDto): Promise<SettlementResponseDto> {
    const domain = await this.repository.create(dto);
    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  async findById(id: string): Promise<SettlementResponseDto> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);
    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  async findByOwner(ownerId: string): Promise<SettlementResponseDto[]> {
    const domains = await this.repository.findByOwnerId(ownerId);
    return domains.map((d) =>
      plainToInstance(SettlementResponseDto, d.toPersistenceSnapshot(), {
        excludeExtraneousValues: true,
      }),
    );
  }

  async updatePriorities(id: string, dto: UpdatePrioritiesDto): Promise<SettlementResponseDto> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);

    domain.updatePriorities(dto.foodPriority, dto.defensePriority, dto.productionPriority);

    const events = domain.pullEvents();
    for (const e of events) this.eventEmitter.emit(e.type, e.payload);

    await this.repository.save(domain);

    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  async tick(id: string): Promise<SettlementResponseDto> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);

    domain.executeTick();
    const events = domain.pullEvents();
    for (const e of events) this.eventEmitter.emit(e.type, e.payload);

    if (domain.isApproachingBsonLimit()) {
      this.eventEmitter.emit('SETTLEMENT_BSON_WARNING', {
        settlementId: id,
        size: domain.getSizeEstimateBytes(),
      });
    }

    await this.repository.save(domain);

    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
