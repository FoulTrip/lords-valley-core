import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GlobalMapChunk } from '@prisma/client';

@Injectable()
export class MapChunksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCoords(chunkX: number, chunkY: number, seed: string): Promise<GlobalMapChunk | null> {
    return this.prisma.globalMapChunk.findUnique({ where: { seed_chunkX_chunkY: { seed, chunkX, chunkY } } });
  }

  async findById(id: string): Promise<GlobalMapChunk | null> {
    return this.prisma.globalMapChunk.findUnique({ where: { id } });
  }

  async findBySettlement(settledBy: string): Promise<GlobalMapChunk[]> {
    return this.prisma.globalMapChunk.findMany({ where: { settledBy } });
  }

  async create(data: { seed: string; chunkX: number; chunkY: number; tiles: unknown; resources: unknown }): Promise<GlobalMapChunk> {
    return this.prisma.globalMapChunk.create({ data: { seed: data.seed, chunkX: data.chunkX, chunkY: data.chunkY, tiles: data.tiles as any, resources: data.resources as any } });
  }

  async updateExplored(id: string, isExplored: boolean): Promise<GlobalMapChunk> {
    return this.prisma.globalMapChunk.update({ where: { id }, data: { isExplored } });
  }

  async claim(id: string, settlementId: string): Promise<GlobalMapChunk> {
    return this.prisma.globalMapChunk.update({ where: { id }, data: { settledBy: settlementId, isExplored: true } });
  }
}
