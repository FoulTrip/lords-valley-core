import { Injectable, NotFoundException } from '@nestjs/common';
import { MapChunksRepository } from './map-chunks.repository';
import { ChunkGeneratorService, DEFAULT_WORLD_SEED } from './chunk-generator.service';
import { GlobalMapChunk } from '@prisma/client';

@Injectable()
export class MapChunksService {
  constructor(
    private readonly repo: MapChunksRepository,
    private readonly generator: ChunkGeneratorService,
  ) {}

  async getOrCreate(chunkX: number, chunkY: number, seed: string | number = DEFAULT_WORLD_SEED): Promise<GlobalMapChunk> {
    const seedStr = String(seed ?? DEFAULT_WORLD_SEED);
    const existing = await this.repo.findByCoords(chunkX, chunkY, seedStr);
    if (existing) return existing;
    const { tiles, resources } = this.generator.generate(chunkX, chunkY, seedStr);
    try {
      return await this.repo.create({ seed: seedStr, chunkX, chunkY, tiles, resources });
    } catch (e: any) {
      // Carrera: otro worker creó el chunk a la vez (bulk en paralelo) -> releer.
      if (e?.code === 'P2002') {
        const retry = await this.repo.findByCoords(chunkX, chunkY, seedStr);
        if (retry) return retry;
      }
      throw e;
    }
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

  async generateBulk(chunks: { chunkX: number; chunkY: number }[], seed: string | number = DEFAULT_WORLD_SEED): Promise<GlobalMapChunk[]> {
    // En paralelo: 36 inserts secuenciales a Atlas tardaban ~18s (timeout del cliente).
    // Promise.all conserva el orden de entrada.
    return Promise.all(chunks.map((c) => this.getOrCreate(c.chunkX, c.chunkY, seed)));
  }
}
