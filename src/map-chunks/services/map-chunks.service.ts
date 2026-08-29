import { Injectable, NotFoundException } from '@nestjs/common';
import { MapChunksRepository } from './map-chunks.repository';
import { ChunkGeneratorService } from './chunk-generator.service';
import { GlobalMapChunk } from '@prisma/client';

@Injectable()
export class MapChunksService {
  constructor(
    private readonly repo: MapChunksRepository,
    private readonly generator: ChunkGeneratorService,
  ) {}

  async getOrCreate(chunkX: number, chunkY: number): Promise<GlobalMapChunk> {
    const existing = await this.repo.findByCoords(chunkX, chunkY);
    if (existing) return existing;
    const { tiles, resources } = this.generator.generate(chunkX, chunkY);
    return this.repo.create({ chunkX, chunkY, tiles, resources });
  }

  async findById(id: string): Promise<GlobalMapChunk> {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundException(`Chunk ${id} not found`);
    return c;
  }

  async explore(id: string): Promise<GlobalMapChunk> {
    await this.findById(id);
    return this.repo.updateExplored(id, true);
  }

  async claim(id: string, settlementId: string): Promise<GlobalMapChunk> {
    await this.findById(id);
    return this.repo.claim(id, settlementId);
  }

  async generateBulk(chunks: { chunkX: number; chunkY: number }[]): Promise<GlobalMapChunk[]> {
    const out: GlobalMapChunk[] = [];
    for (const c of chunks) out.push(await this.getOrCreate(c.chunkX, c.chunkY));
    return out;
  }
}
