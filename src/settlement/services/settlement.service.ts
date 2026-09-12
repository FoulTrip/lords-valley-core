import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SettlementRepository } from './settlement.repository';
import { CreateSettlementDto } from '../dto/create-settlement.dto';
import { UpdatePrioritiesDto } from '../dto/update-priorities.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { plainToInstance } from 'class-transformer';
import { SettlementResponseDto } from '../dto/settlement-response.dto';
import { ResourceType } from '@prisma/client';

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

  async updateWorldState(id: string, worldState: any): Promise<SettlementResponseDto> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);
    // Merge con existente para no borrar terrainHeights/farmPlots si solo actualiza uno
    const prev = (domain.getWorldState() as any) || {};
    const merged = { ...prev, ...worldState };
    domain.updateWorldState(merged);
    await this.repository.save(domain);
    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  async rename(id: string, name: string): Promise<SettlementResponseDto> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);
    domain.rename(name);
    await this.repository.save(domain);
    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Spawna survivors server-side para el settlement.
   * Los NPCs se generan con IDs UUID reales y stats canónicos — sin Math.random en el cliente.
   * El frontend llama este endpoint en lugar de `new Survivor()`.
   */
  async spawnSurvivors(id: string, count: number): Promise<SettlementResponseDto> {
    const clamped = Math.max(1, Math.min(count, 5));
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);

    for (let i = 0; i < clamped; i++) {
      const survivorData = (this.repository as any).makeDefaultSurvivor(
        this.randomName(),
        this.randomLastName(),
        this.randomProfession(),
      );
      domain.addSurvivor(survivorData);
    }

    const events = domain.pullEvents();
    for (const e of events) this.eventEmitter.emit(e.type, e.payload);

    await this.repository.save(domain);

    return plainToInstance(SettlementResponseDto, domain.toPersistenceSnapshot(), {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Agrega recursos al inventario del settlement con validación server-side.
   * El cliente no puede agregar ítems sin que el servidor lo valide.
   */
  async addToInventory(
    id: string,
    resourceType: string,
    quantity: string,
  ): Promise<{ ok: boolean; newQuantity: string; reason?: string }> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);

    // Validar que el tipo de recurso sea válido
    if (!Object.values(ResourceType).includes(resourceType as ResourceType)) {
      throw new BadRequestException(`Tipo de recurso inválido: ${resourceType}`);
    }

    const result = domain.addToInventory(resourceType as ResourceType, quantity);

    if (result.ok) {
      await this.repository.save(domain);
    }

    return result;
  }

  /**
   * Establece el modo de juego del settlement en el servidor.
   * El cliente DEBE usar este endpoint — no puede modificar window.__CREATIVE_MODE__ directamente.
   */
  async setGameMode(id: string, mode: 'creative' | 'survival'): Promise<{ gameMode: string }> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException(`Settlement ${id} not found`);

    domain.setGameMode(mode);
    const events = domain.pullEvents();
    for (const e of events) this.eventEmitter.emit(e.type, e.payload);

    await this.repository.save(domain);

    return { gameMode: mode };
  }

  // Pool de nombres para generación server-side (sin Math.random en el cliente)
  private readonly FIRST_NAMES = ['Aldous', 'Goffrey', 'Eldric', 'Wulfric', 'Rowena', 'Gisela', 'Brom', 'Yara', 'Cedric', 'Mira', 'Hob', 'Edda', 'Joren', 'Lysa', 'Tormund', 'Svala', 'Ragnor', 'Thalia', 'Dorn', 'Sera'];
  private readonly LAST_NAMES = ['Stonehand', 'Ironfoot', 'Dawnfield', 'Coldwater', 'Ashwood', 'Greymount', 'Thornwall', 'Blackvale', 'Riverstone', 'Windmere'];
  private readonly PROFESSIONS = ['LENADOR', 'MINERO', 'AGRICULTOR', 'HERRERO', 'SOLDADO', 'MEDICO', 'CARPINTERO', 'COMERCIANTE'];

  private randomName(): string {
    return this.FIRST_NAMES[Math.floor(Math.random() * this.FIRST_NAMES.length)];
  }
  private randomLastName(): string {
    return this.LAST_NAMES[Math.floor(Math.random() * this.LAST_NAMES.length)];
  }
  private randomProfession(): string {
    return this.PROFESSIONS[Math.floor(Math.random() * this.PROFESSIONS.length)];
  }
}
