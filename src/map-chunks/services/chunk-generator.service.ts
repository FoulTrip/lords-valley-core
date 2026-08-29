import { Injectable } from '@nestjs/common';
import { ResourceType } from '@prisma/client';

@Injectable()
export class ChunkGeneratorService {
  private readonly CHUNK_SIZE = 32;
  private readonly TILE_GRASS = 1;
  private readonly TILE_DIRT = 2;
  private readonly TILE_ROCK = 101; // >=100 = collision
  private readonly TILE_FOREST = 5;
  private readonly TILE_WATER = 102;

  generate(chunkX: number, chunkY: number, seed = 1337): { tiles: number[][]; resources: unknown[] } {
    const tiles: number[][] = [];
    const resources: unknown[] = [];

    for (let y = 0; y < this.CHUNK_SIZE; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.CHUNK_SIZE; x++) {
        const n = this.pseudoRandom(chunkX, chunkY, x, y, seed);
        let gid: number;
        if (n < 0.05) gid = this.TILE_WATER;
        else if (n < 0.10) gid = this.TILE_ROCK;
        else if (n < 0.20) gid = this.TILE_FOREST;
        else if (n < 0.35) gid = this.TILE_DIRT;
        else gid = this.TILE_GRASS;
        row.push(gid);
      }
      tiles.push(row);
    }

    const count = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, 99, 99, seed) * 4); // 2-5
    const types: ResourceType[] = [
      ResourceType.MADERA,
      ResourceType.PIEDRA,
      ResourceType.HIERRO,
      ResourceType.CARBON,
      ResourceType.TRIGO,
    ];
    for (let i = 0; i < count; i++) {
      const rx = Math.floor(this.pseudoRandom(chunkX, chunkY, i * 7, i * 13, seed + 1) * 32);
      const ry = Math.floor(this.pseudoRandom(chunkX, chunkY, i * 13, i * 7, seed + 2) * 32);
      const type = types[Math.floor(this.pseudoRandom(chunkX, chunkY, i, i * 2, seed + 3) * types.length)];
      const qty = (BigInt(500 + Math.floor(this.pseudoRandom(chunkX, chunkY, i * 3, i * 5, seed + 4) * 2000)) * BigInt(1e18)).toString();
      resources.push({
        type,
        quantity: qty,
        posX: chunkX * 1024 + rx * 32 + 16,
        posY: chunkY * 1024 + ry * 32 + 16,
        chunkLocalX: rx,
        chunkLocalY: ry,
      });
    }

    return { tiles, resources };
  }

  private pseudoRandom(cx: number, cy: number, x: number, y: number, seed: number): number {
    const s = Math.sin(cx * 374761 + cy * 668265261 + x * 1274126177 + y * 15485863 + seed * 961748941) * 10000;
    return s - Math.floor(s);
  }

  worldToChunk(worldX: number, worldY: number): { chunkX: number; chunkY: number; localX: number; localY: number } {
    const chunkX = Math.floor(worldX / 1024);
    const chunkY = Math.floor(worldY / 1024);
    const localX = Math.floor((worldX - chunkX * 1024) / 32);
    const localY = Math.floor((worldY - chunkY * 1024) / 32);
    return { chunkX, chunkY, localX, localY };
  }
}
