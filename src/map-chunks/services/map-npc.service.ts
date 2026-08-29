import { Injectable, NotFoundException } from '@nestjs/common';
import { MapNpcRepository } from './map-npc.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { MapNpcDto } from '../controllers/map-npc.dto';
import { MapChunksService } from './map-chunks.service';

@Injectable()
export class MapNpcService {
  constructor(
    private readonly repo: MapNpcRepository,
    private readonly prisma: PrismaService,
    private readonly mapChunksService: MapChunksService,
  ) {}

  async findAll(): Promise<MapNpcDto[]> {
    const npcs = await this.repo.findAll();
    return npcs.map((n) => this.toDto(n));
  }

  async findOne(id: string): Promise<MapNpcDto> {
    const n = await this.repo.findById(id);
    if (!n) throw new NotFoundException(`MapNpc ${id} not found`);
    return this.toDto(n);
  }

  async create(data: {
    name: string;
    chunkX: number;
    chunkY: number;
    positionX: number;
    positionY: number;
    settlementId?: string;
    survivorId?: string;
  }): Promise<MapNpcDto> {
    const { chunkX, chunkY } = data;
    await this.mapChunksService.getOrCreate(chunkX, chunkY);

    const created = await this.repo.create({
      name: data.name,
      positionX: data.positionX,
      positionY: data.positionY,
      chunkX,
      chunkY,
      settlementId: data.settlementId,
      survivorId: data.survivorId,
      isActive: true,
    });

    return this.toDto(created);
  }

  async update(id: string, data: {
    name?: string;
    positionX?: number;
    positionY?: number;
    isActive?: boolean;
  }): Promise<MapNpcDto> {
    await this.repo.update(id, data);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDto(npc: any): MapNpcDto {
    return {
      id: npc.id,
      name: npc.name,
      chunkX: npc.chunkX,
      chunkY: npc.chunkY,
      positionX: npc.positionX,
      positionY: npc.positionY,
      settlementId: npc.settlementId,
      survivorId: npc.survivorId,
      isActive: npc.isActive,
      createdAt: npc.createdAt,
      updatedAt: npc.updatedAt,
    } as MapNpcDto;
  }
}