import { Injectable } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import { IsometricProjectionService } from './isometric-projection.service';

/** Semilla del mundo por defecto (coincide con el default del frontend). */
export const DEFAULT_WORLD_SEED = 'default_seed';

/** FNV-1a 32 bits: normaliza seeds string a uint32 determinista. */
function hashSeedToUint32(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: RNG determinista para generación de mundo por seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

@Injectable()
export class ChunkGeneratorService {
  private readonly CHUNK_SIZE = 32;
  /** Lado en píxeles del mundo lógico ortogonal: 32 tiles * 32px = 1024. */
  private readonly CHUNK_PIXELS = 1024;
  private readonly TILE_PIXELS = 32;
  private readonly TILE_GRASS = 1;
  private readonly TILE_TREE = 2;
  private readonly TILE_WATER = 102;
  private readonly TILE_COBRE = 30;
  private readonly TILE_ESTANO = 31;
  private readonly TILE_HIERRO = 32;
  private readonly TILE_PLATA = 33;
  private readonly TILE_ORO = 34;
  private readonly TILE_CARBON = 35;

  // Rarezas al CUARTO de las originales (15.3% -> ~3.8% del mapa).
  private readonly MINERAL_CONFIGS = [
    { type: ResourceType.CARBON, gid: 35, rarity: 0.0625, veinMin: 8, veinMax: 15 },
    { type: ResourceType.COBRE, gid: 30, rarity: 0.05, veinMin: 6, veinMax: 12 },
    { type: ResourceType.ESTANO, gid: 31, rarity: 0.045, veinMin: 6, veinMax: 12 },
    { type: ResourceType.HIERRO, gid: 32, rarity: 0.0375, veinMin: 5, veinMax: 10 },
    { type: ResourceType.PLATA, gid: 33, rarity: 0.0125, veinMin: 3, veinMax: 7 },
    { type: ResourceType.ORO, gid: 34, rarity: 0.005, veinMin: 2, veinMax: 5 },
  ] as const;

  // Parámetro opcional con default para no romper instanciación manual
  // (p. ej. prisma/seed.ts hace `new ChunkGeneratorService()`); Nest inyecta el singleton.
  constructor(private readonly iso: IsometricProjectionService = new IsometricProjectionService()) {}

  // Cachés por seed normalizada: el mismo mundo genera siempre los mismos tiles.
  private waterBySeed = new Map<number, { tiles: Set<string>; type: 'none' | 'river' | 'lake' }>();
  private mineralsBySeed = new Map<number, Map<string, string>>();
  private static readonly MAX_CACHED_SEEDS = 8;

  private evictOldest<K, V>(map: Map<K, V>): void {
    if (map.size >= ChunkGeneratorService.MAX_CACHED_SEEDS) {
      const oldest = map.keys().next().value as K;
      map.delete(oldest);
    }
  }

  private getWaterTiles(seedNum: number): Set<string> {
    const cached = this.waterBySeed.get(seedNum);
    if (cached) return cached.tiles;
    this.evictOldest(this.waterBySeed);
    const rng = mulberry32(seedNum);
    const W = this.WORLD_TILES;
    const water = new Set<string>();
    const roll = rng();
    let type: 'none' | 'river' | 'lake';
    if (roll < 0.15) {
      type = 'none';
      this.waterBySeed.set(seedNum, { tiles: water, type });
      return water;
    } else if (roll < 0.75) {
      type = 'river';
    } else {
      type = 'lake';
    }

    if (type === 'lake') {
      const radius = 5 + Math.floor(rng() * 11); // 5-15 tiles de radio
      const cx = 30 + Math.floor(rng() * (W - 60));
      const cy = 30 + Math.floor(rng() * (W - 60));
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = y - cy;
          const dist = Math.hypot(dx, dy);
          const edgeNoise = (rng() - 0.5) * 4;
          if (dist < radius + edgeNoise) water.add(`${x}:${y}`);
        }
      }
      this.waterBySeed.set(seedNum, { tiles: water, type });
      return water;
    }

    // Río serpenteante ancho 5-15 tiles pequeños, contiguo
    const horizontal = rng() < 0.6;
    let width = 5 + Math.floor(rng() * 11); // 5-15
    const centerline: [number, number][] = [];
    if (horizontal) {
      let x = 0;
      let y = 60 + Math.floor(rng() * 72);
      centerline.push([x, y]);
      while (x < W - 1) {
        const r = rng();
        if (r < 0.5 && x < W - 1) x += 1;
        else if (r < 0.75) y = Math.max(2, Math.min(W - 3, y + 1));
        else y = Math.max(2, Math.min(W - 3, y - 1));
        centerline.push([x, y]);
        if (rng() < 0.25) width = Math.max(5, Math.min(15, width + (rng() < 0.5 ? 1 : -1)));
        if (x === W - 1) break;
      }
      for (const [cx, cy] of centerline) {
        const w = Math.max(5, Math.min(15, width + Math.floor((rng() - 0.5) * 2)));
        const half = Math.floor(w / 2);
        for (let dy = -half; dy <= half; dy++) {
          const ny = cy + dy;
          if (ny >= 0 && ny < W) water.add(`${cx}:${ny}`);
        }
        if (rng() < 0.2) {
          const ny = cy + (rng() < 0.5 ? half + 1 : -half - 1);
          if (ny >= 0 && ny < W) water.add(`${cx}:${ny}`);
        }
      }
    } else {
      let x = 60 + Math.floor(rng() * 72);
      let y = 0;
      centerline.push([x, y]);
      while (y < W - 1) {
        const r = rng();
        if (r < 0.5 && y < W - 1) y += 1;
        else if (r < 0.75) x = Math.max(2, Math.min(W - 3, x + 1));
        else x = Math.max(2, Math.min(W - 3, x - 1));
        centerline.push([x, y]);
        if (rng() < 0.25) width = Math.max(5, Math.min(15, width + (rng() < 0.5 ? 1 : -1)));
        if (y === W - 1) break;
      }
      for (const [cx, cy] of centerline) {
        const w = Math.max(5, Math.min(15, width + Math.floor((rng() - 0.5) * 2)));
        const half = Math.floor(w / 2);
        for (let dx = -half; dx <= half; dx++) {
          const nx = cx + dx;
          if (nx >= 0 && nx < W) water.add(`${nx}:${cy}`);
        }
        if (rng() < 0.2) {
          const nx = cx + (rng() < 0.5 ? half + 1 : -half - 1);
          if (nx >= 0 && nx < W) water.add(`${nx}:${cy}`);
        }
      }
    }
    this.waterBySeed.set(seedNum, { tiles: water, type });
    return water;
  }

  private isWaterTile(worldTileX: number, worldTileY: number, seedNum: number): boolean {
    return this.getWaterTiles(seedNum).has(`${worldTileX}:${worldTileY}`);
  }

  // Compatibilidad chunk-level
  private getWaterChunks(seedNum: number): Set<string> {
    const tiles = this.getWaterTiles(seedNum);
    const chunks = new Set<string>();
    for (const key of tiles) {
      const [wx, wy] = key.split(':').map(Number);
      const cx = Math.floor(wx / 32);
      const cy = Math.floor(wy / 32);
      chunks.add(`${cx}:${cy}`);
    }
    return chunks;
  }

  private getRiverChunks(seedNum: number): Set<string> {
    return this.getWaterChunks(seedNum);
  }

  private isWaterChunk(chunkX: number, chunkY: number, seedNum: number): boolean {
    return this.getWaterChunks(seedNum).has(`${chunkX}:${chunkY}`);
  }

  private isRiverChunk(chunkX: number, chunkY: number, seedNum: number): boolean {
    return this.isWaterChunk(chunkX, chunkY, seedNum);
  }

  private getTreeDensity(chunkX: number, chunkY: number, seedNum: number): number {
    return 0.23 + this.pseudoRandom(chunkX, chunkY, 555, 555, seedNum) * 0.47;
  }

  private generateMineralTiles(seedNum: number): Map<string, string> {
    const cached = this.mineralsBySeed.get(seedNum);
    if (cached) return cached;
    this.evictOldest(this.mineralsBySeed);
    const rng = mulberry32(seedNum ^ 0x85ebca6b);
    const W = this.WORLD_TILES;
    const totalTiles = W * W;
    const mineralMap = new Map<string, string>();
    const occupied = new Set<string>(this.getWaterTiles(seedNum));
    const MINERAL_SCALE = 0.18;
    for (const cfg of this.MINERAL_CONFIGS) {
      const targetTiles = Math.floor(totalTiles * cfg.rarity * MINERAL_SCALE);
      let placed = 0;
      let attempts = 0;
      while (placed < targetTiles && attempts < targetTiles * 3) {
        attempts++;
        const veinSize = cfg.veinMin + Math.floor(rng() * (cfg.veinMax - cfg.veinMin + 1));
        let cx: number, cy: number, tries = 0;
        do {
          cx = Math.floor(rng() * W);
          cy = Math.floor(rng() * W);
          tries++;
        } while ((occupied.has(`${cx}:${cy}`) || this.isWaterTile(cx, cy, seedNum)) && tries < 20);
        if (occupied.has(`${cx}:${cy}`) || this.isWaterTile(cx, cy, seedNum)) continue;
        const vein = new Set<string>();
        vein.add(`${cx}:${cy}`);
        let veinAttempts = 0;
        while (vein.size < veinSize && veinAttempts < veinSize * 5) {
          const arr = Array.from(vein);
          const [rx, ry] = arr[Math.floor(rng() * arr.length)].split(':').map(Number);
          const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];
          const [dx, dy] = dirs[Math.floor(rng() * 4)];
          const nx = rx + dx, ny = ry + dy;
          const key = `${nx}:${ny}`;
          if (nx < 0 || nx >= W || ny < 0 || ny >= W) { veinAttempts++; continue; }
          if (occupied.has(key) || this.isWaterTile(nx, ny, seedNum) || mineralMap.has(key)) { veinAttempts++; continue; }
          vein.add(key);
          veinAttempts = 0;
        }
        for (const k of vein) {
          if (placed >= targetTiles) break;
          if (!occupied.has(k) && !this.isWaterTile(parseInt(k.split(':')[0]), parseInt(k.split(':')[1]), seedNum)) {
            mineralMap.set(k, cfg.type);
            occupied.add(k);
            placed++;
          }
        }
      }
    }
    this.mineralsBySeed.set(seedNum, mineralMap);
    return mineralMap;
  }

  private getMineralType(worldTileX: number, worldTileY: number, seedNum: number): string | null {
    return this.generateMineralTiles(seedNum).get(`${worldTileX}:${worldTileY}`) ?? null;
  }

  private isMineralTile(worldTileX: number, worldTileY: number, seedNum: number): boolean {
    return this.generateMineralTiles(seedNum).has(`${worldTileX}:${worldTileY}`);
  }

  private mineralGidForType(type: string): number {
    const cfg = this.MINERAL_CONFIGS.find(c => c.type === type);
    return cfg ? cfg.gid : this.TILE_GRASS;
  }

  private isTreeTile(chunkX: number, chunkY: number, localX: number, localY: number, seedNum: number): boolean {
    const worldTileX = chunkX * this.CHUNK_SIZE + localX;
    const worldTileY = chunkY * this.CHUNK_SIZE + localY;
    if (this.isWaterTile(worldTileX, worldTileY, seedNum)) return false;
    if (this.isMineralTile(worldTileX, worldTileY, seedNum)) return false;
    const density = this.getTreeDensity(chunkX, chunkY, seedNum);
    return this.pseudoRandom(chunkX, chunkY, localX, localY, seedNum) < density;
  }

  generate(chunkX: number, chunkY: number, seed: string | number = DEFAULT_WORLD_SEED): { tiles: number[][]; resources: unknown[] } {
    const seedNum = hashSeedToUint32(seed);
    const tiles: number[][] = [];
    const resources: unknown[] = [];

    for (let y = 0; y < this.CHUNK_SIZE; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.CHUNK_SIZE; x++) {
        const worldTileX = chunkX * this.CHUNK_SIZE + x;
        const worldTileY = chunkY * this.CHUNK_SIZE + y;
        const mineralType = this.getMineralType(worldTileX, worldTileY, seedNum);
        let gid: number;
        if (this.isWaterTile(worldTileX, worldTileY, seedNum)) {
          gid = this.TILE_WATER;
        } else if (mineralType) {
          gid = this.mineralGidForType(mineralType);
        } else if (this.isTreeTile(chunkX, chunkY, x, y, seedNum)) {
          gid = this.TILE_TREE;
        } else {
          gid = this.TILE_GRASS;
        }
        row.push(gid);
      }
      tiles.push(row);
    }

    const count = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, 99, 99, seedNum) * 4);
    const types: ResourceType[] = [
      ResourceType.MADERA,
      ResourceType.PIEDRA,
      ResourceType.HIERRO,
      ResourceType.CARBON,
      ResourceType.TRIGO,
    ];
    for (let i = 0; i < count; i++) {
      const rx = Math.floor(this.pseudoRandom(chunkX, chunkY, i * 7, i * 13, seedNum + 1) * 32);
      const ry = Math.floor(this.pseudoRandom(chunkX, chunkY, i * 13, i * 7, seedNum + 2) * 32);
      const type = types[Math.floor(this.pseudoRandom(chunkX, chunkY, i, i * 2, seedNum + 3) * types.length)];
      const qty = (BigInt(500 + Math.floor(this.pseudoRandom(chunkX, chunkY, i * 3, i * 5, seedNum + 4) * 2000)) * BigInt(1e18)).toString();
      const jitterX = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, i * 11, i * 17, seedNum + 5) * 28);
      const jitterY = 2 + Math.floor(this.pseudoRandom(chunkX, chunkY, i * 17, i * 11, seedNum + 6) * 28);
      resources.push({
        type,
        quantity: qty,
        // Mundo lógico ORTOGONAL (contrato persistido): no son píxeles iso.
        posX: chunkX * this.CHUNK_PIXELS + rx * this.TILE_PIXELS + jitterX,
        posY: chunkY * this.CHUNK_PIXELS + ry * this.TILE_PIXELS + jitterY,
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

  private readonly WORLD_CHUNKS = 6;
  private readonly WORLD_TILES = 192;

  /**
   * Mundo lógico ORTOGONAL (píxeles: worldX = chunkX*1024 + localX*32)
   * -> chunk + local. Es el contrato persistido; no aplica proyección iso.
   */
  worldToChunk(worldX: number, worldY: number): { chunkX: number; chunkY: number; localX: number; localY: number } {
    const chunkX = Math.floor(worldX / this.CHUNK_PIXELS);
    const chunkY = Math.floor(worldY / this.CHUNK_PIXELS);
    const localX = Math.floor((worldX - chunkX * this.CHUNK_PIXELS) / this.TILE_PIXELS);
    const localY = Math.floor((worldY - chunkY * this.CHUNK_PIXELS) / this.TILE_PIXELS);
    return { chunkX, chunkY, localX, localY };
  }

  /** Inversa ortogonal de worldToChunk (píxeles lógicos, sin iso). */
  chunkToWorld(chunkX: number, chunkY: number, localX: number, localY: number): { worldX: number; worldY: number } {
    return {
      worldX: chunkX * this.CHUNK_PIXELS + localX * this.TILE_PIXELS,
      worldY: chunkY * this.CHUNK_PIXELS + localY * this.TILE_PIXELS,
    };
  }

  // ---- Helpers de render isométrico (no cambian datos, solo proyección) ----

  /** Tile lógico de mundo -> vértice norte en pantalla (diamante 2:1). */
  worldTileToScreen(worldTileX: number, worldTileY: number): { screenX: number; screenY: number } {
    return this.iso.tileToScreen(worldTileX, worldTileY);
  }

  /** Chunk + local -> pantalla vía el origen del chunk (alineación garantizada). */
  chunkLocalToScreen(chunkX: number, chunkY: number, localX: number, localY: number): {
    screenX: number;
    screenY: number;
  } {
    return this.iso.tileToScreenViaChunk(chunkX, chunkY, localX, localY);
  }
}
