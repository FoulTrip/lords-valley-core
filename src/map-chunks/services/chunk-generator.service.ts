import { Injectable } from '@nestjs/common';
import { ResourceType } from '@prisma/client';

@Injectable()
export class ChunkGeneratorService {
  private readonly CHUNK_SIZE = 32;
  private readonly TILE_GRASS = 1;
  private readonly TILE_TREE = 2;
  private readonly TILE_WATER = 102;
  private readonly TILE_COBRE = 30;
  private readonly TILE_ESTANO = 31;
  private readonly TILE_HIERRO = 32;
  private readonly TILE_PLATA = 33;
  private readonly TILE_ORO = 34;
  private readonly TILE_CARBON = 35;

  private readonly MINERAL_CONFIGS = [
    { type: ResourceType.CARBON, gid: 35, rarity: 0.25, veinMin: 8, veinMax: 15 },
    { type: ResourceType.COBRE, gid: 30, rarity: 0.20, veinMin: 6, veinMax: 12 },
    { type: ResourceType.ESTANO, gid: 31, rarity: 0.18, veinMin: 6, veinMax: 12 },
    { type: ResourceType.HIERRO, gid: 32, rarity: 0.15, veinMin: 5, veinMax: 10 },
    { type: ResourceType.PLATA, gid: 33, rarity: 0.05, veinMin: 3, veinMax: 7 },
    { type: ResourceType.ORO, gid: 34, rarity: 0.02, veinMin: 2, veinMax: 5 },
  ] as const;

  private cachedMineralTiles: Map<string, string> | null = null;

  private readonly WORLD_CHUNKS = 6;
  private readonly WORLD_TILES = 192;
  private cachedWaterTiles: Set<string> | null = null;
  private cachedType: 'none' | 'river' | 'lake' = 'river';

  private getWaterTiles(): Set<string> {
    if (this.cachedWaterTiles) return this.cachedWaterTiles;
    const W = this.WORLD_TILES;
    const water = new Set<string>();
    const roll = Math.random();
    if (roll < 0.15) {
      this.cachedType = 'none';
      this.cachedWaterTiles = water;
      return water;
    } else if (roll < 0.75) {
      this.cachedType = 'river';
    } else {
      this.cachedType = 'lake';
    }

    if (this.cachedType === 'lake') {
      const radius = 5 + Math.floor(Math.random() * 11); // 5-15 tiles de radio
      const cx = 30 + Math.floor(Math.random() * (W - 60));
      const cy = 30 + Math.floor(Math.random() * (W - 60));
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = y - cy;
          const dist = Math.hypot(dx, dy);
          const edgeNoise = (Math.random() - 0.5) * 4;
          if (dist < radius + edgeNoise) water.add(`${x}:${y}`);
        }
      }
      this.cachedWaterTiles = water;
      return water;
    }

    // Río serpenteante ancho 5-15 tiles pequeños, contiguo
    const horizontal = Math.random() < 0.6;
    let width = 5 + Math.floor(Math.random() * 11); // 5-15
    const centerline: [number, number][] = [];
    if (horizontal) {
      let x = 0;
      let y = 60 + Math.floor(Math.random() * 72);
      centerline.push([x, y]);
      while (x < W - 1) {
        const r = Math.random();
        if (r < 0.5 && x < W - 1) x += 1;
        else if (r < 0.75) y = Math.max(2, Math.min(W - 3, y + 1));
        else y = Math.max(2, Math.min(W - 3, y - 1));
        centerline.push([x, y]);
        if (Math.random() < 0.25) width = Math.max(5, Math.min(15, width + (Math.random() < 0.5 ? 1 : -1)));
        if (x === W - 1) break;
      }
      for (const [cx, cy] of centerline) {
        const w = Math.max(5, Math.min(15, width + Math.floor((Math.random() - 0.5) * 2)));
        const half = Math.floor(w / 2);
        for (let dy = -half; dy <= half; dy++) {
          const ny = cy + dy;
          if (ny >= 0 && ny < W) water.add(`${cx}:${ny}`);
        }
        if (Math.random() < 0.2) {
          const ny = cy + (Math.random() < 0.5 ? half + 1 : -half - 1);
          if (ny >= 0 && ny < W) water.add(`${cx}:${ny}`);
        }
      }
    } else {
      let x = 60 + Math.floor(Math.random() * 72);
      let y = 0;
      centerline.push([x, y]);
      while (y < W - 1) {
        const r = Math.random();
        if (r < 0.5 && y < W - 1) y += 1;
        else if (r < 0.75) x = Math.max(2, Math.min(W - 3, x + 1));
        else x = Math.max(2, Math.min(W - 3, x - 1));
        centerline.push([x, y]);
        if (Math.random() < 0.25) width = Math.max(5, Math.min(15, width + (Math.random() < 0.5 ? 1 : -1)));
        if (y === W - 1) break;
      }
      for (const [cx, cy] of centerline) {
        const w = Math.max(5, Math.min(15, width + Math.floor((Math.random() - 0.5) * 2)));
        const half = Math.floor(w / 2);
        for (let dx = -half; dx <= half; dx++) {
          const nx = cx + dx;
          if (nx >= 0 && nx < W) water.add(`${nx}:${cy}`);
        }
        if (Math.random() < 0.2) {
          const nx = cx + (Math.random() < 0.5 ? half + 1 : -half - 1);
          if (nx >= 0 && nx < W) water.add(`${nx}:${cy}`);
        }
      }
    }
    this.cachedWaterTiles = water;
    return water;
  }

  private isWaterTile(worldTileX: number, worldTileY: number): boolean {
    return this.getWaterTiles().has(`${worldTileX}:${worldTileY}`);
  }

  // Compatibilidad chunk-level
  private getWaterChunks(): Set<string> {
    const tiles = this.getWaterTiles();
    const chunks = new Set<string>();
    for (const key of tiles) {
      const [wx, wy] = key.split(':').map(Number);
      const cx = Math.floor(wx / 32);
      const cy = Math.floor(wy / 32);
      chunks.add(`${cx}:${cy}`);
    }
    return chunks;
  }

  private getRiverChunks(): Set<string> {
    return this.getWaterChunks();
  }

  private isWaterChunk(chunkX: number, chunkY: number): boolean {
    return this.getWaterChunks().has(`${chunkX}:${chunkY}`);
  }

  private isRiverChunk(chunkX: number, chunkY: number): boolean {
    return this.isWaterChunk(chunkX, chunkY);
  }

  private getTreeDensity(chunkX: number, chunkY: number): number {
    return 0.23 + this.pseudoRandom(chunkX, chunkY, 555, 555, 1337) * 0.47;
  }

  private generateMineralTiles(): Map<string, string> {
    if (this.cachedMineralTiles) return this.cachedMineralTiles;
    const W = this.WORLD_TILES;
    const totalTiles = W * W;
    const mineralMap = new Map<string, string>();
    const occupied = new Set<string>(this.getWaterTiles());
    const MINERAL_SCALE = 0.18;
    for (const cfg of this.MINERAL_CONFIGS) {
      const targetTiles = Math.floor(totalTiles * cfg.rarity * MINERAL_SCALE);
      let placed = 0;
      let attempts = 0;
      while (placed < targetTiles && attempts < targetTiles * 3) {
        attempts++;
        const veinSize = cfg.veinMin + Math.floor(Math.random() * (cfg.veinMax - cfg.veinMin + 1));
        let cx: number, cy: number, tries = 0;
        do {
          cx = Math.floor(Math.random() * W);
          cy = Math.floor(Math.random() * W);
          tries++;
        } while ((occupied.has(`${cx}:${cy}`) || this.isWaterTile(cx, cy)) && tries < 20);
        if (occupied.has(`${cx}:${cy}`) || this.isWaterTile(cx, cy)) continue;
        const vein = new Set<string>();
        vein.add(`${cx}:${cy}`);
        let veinAttempts = 0;
        while (vein.size < veinSize && veinAttempts < veinSize * 5) {
          const arr = Array.from(vein);
          const [rx, ry] = arr[Math.floor(Math.random() * arr.length)].split(':').map(Number);
          const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];
          const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
          const nx = rx + dx, ny = ry + dy;
          const key = `${nx}:${ny}`;
          if (nx < 0 || nx >= W || ny < 0 || ny >= W) { veinAttempts++; continue; }
          if (occupied.has(key) || this.isWaterTile(nx, ny) || mineralMap.has(key)) { veinAttempts++; continue; }
          vein.add(key);
          veinAttempts = 0;
        }
        for (const k of vein) {
          if (placed >= targetTiles) break;
          if (!occupied.has(k) && !this.isWaterTile(parseInt(k.split(':')[0]), parseInt(k.split(':')[1]))) {
            mineralMap.set(k, cfg.type);
            occupied.add(k);
            placed++;
          }
        }
      }
    }
    this.cachedMineralTiles = mineralMap;
    return mineralMap;
  }

  private getMineralType(worldTileX: number, worldTileY: number): string | null {
    return this.generateMineralTiles().get(`${worldTileX}:${worldTileY}`) ?? null;
  }

  private isMineralTile(worldTileX: number, worldTileY: number): boolean {
    return this.generateMineralTiles().has(`${worldTileX}:${worldTileY}`);
  }

  private mineralGidForType(type: string): number {
    const cfg = this.MINERAL_CONFIGS.find(c => c.type === type);
    return cfg ? cfg.gid : this.TILE_GRASS;
  }

  private isTreeTile(chunkX: number, chunkY: number, localX: number, localY: number): boolean {
    const worldTileX = chunkX * this.CHUNK_SIZE + localX;
    const worldTileY = chunkY * this.CHUNK_SIZE + localY;
    if (this.isWaterTile(worldTileX, worldTileY)) return false;
    if (this.isMineralTile(worldTileX, worldTileY)) return false;
    const density = this.getTreeDensity(chunkX, chunkY);
    return this.pseudoRandom(chunkX, chunkY, localX, localY, 1337) < density;
  }

  generate(chunkX: number, chunkY: number, seed = 1337): { tiles: number[][]; resources: unknown[] } {
    const tiles: number[][] = [];
    const resources: unknown[] = [];

    for (let y = 0; y < this.CHUNK_SIZE; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.CHUNK_SIZE; x++) {
        const worldTileX = chunkX * this.CHUNK_SIZE + x;
        const worldTileY = chunkY * this.CHUNK_SIZE + y;
        const mineralType = this.getMineralType(worldTileX, worldTileY);
        let gid: number;
        if (this.isWaterTile(worldTileX, worldTileY)) {
          gid = this.TILE_WATER;
        } else if (mineralType) {
          gid = this.mineralGidForType(mineralType);
        } else if (this.isTreeTile(chunkX, chunkY, x, y)) {
          gid = this.TILE_TREE;
        } else {
          gid = this.TILE_GRASS;
        }
        row.push(gid);
      }
      tiles.push(row);
    }

    const count = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, 99, 99, seed) * 4);
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
      const jitterX = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, i * 11, i * 17, seed + 5) * 28);
      const jitterY = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, i * 17, i * 11, seed + 6) * 28);
      resources.push({
        type,
        quantity: qty,
        posX: chunkX * 1024 + rx * 32 + jitterX,
        posY: chunkY * 1024 + ry * 32 + jitterY,
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
