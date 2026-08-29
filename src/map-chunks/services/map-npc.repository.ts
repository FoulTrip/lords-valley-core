import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MapNpc } from '@prisma/client';

@Injectable()
export class MapNpcRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<MapNpc[]> {
    return this.prisma.mapNpc.findMany();
  }

  async findById(id: string): Promise<MapNpc | null> {
    return this.prisma.mapNpc.findUnique({ where: { id } });
  }

  async create(data: {
    name: string;
    chunkX: number;
    chunkY: number;
    positionX: number;
    positionY: number;
    settlementId?: string;
    survivorId?: string;
    isActive?: boolean;
  }): Promise<MapNpc> {
    return this.prisma.mapNpc.create({ data });
  }

  async update(id: string, data: {
    name?: string;
    positionX?: number;
    positionY?: number;
    isActive?: boolean;
  }): Promise<MapNpc> {
    return this.prisma.mapNpc.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.mapNpc.delete({ where: { id } });
  }
}