import { Injectable } from '@nestjs/common';

/**
 * Proyección isométrica pura 2:1 ("diamante").
 *
 * Convención canónica (sin distorsión, simétrica):
 * - Cada tile lógico (wx, wy) es un diamante de TILE_WIDTH x TILE_HEIGHT
 *   con TILE_WIDTH = 2 * TILE_HEIGHT (aspecto exacto 2:1).
 * - `tileToScreen` devuelve el vértice NORTE (top) del diamante.
 *   Esquinas relativas al top (sx, sy):
 *     N = (sx, sy)
 *     E = (sx + HALF_W, sy + HALF_H)
 *     S = (sx, sy + TILE_H)
 *     W = (sx - HALF_W, sy + HALF_H)
 * - El almacenamiento del backend sigue siendo grilla ortogonal
 *   (tiles[32][32], worldX = chunkX*1024 + localX*32). Este servicio
 *   SOLO convierte grilla lógica -> pantalla para render. No cambia
 *   ningún dato persistido.
 * - La alineación chunk está garantizada porque el origen del chunk es
 *   exactamente tileToScreen(cx*S, cy*S) y cada tile local suma
 *   (lx - ly)*HALF_W, (lx + ly)*HALF_H. Así los bordes de diamantes
 *   pequeños coinciden vértice a vértice con el diamante del chunk.
 */
@Injectable()
export class IsometricProjectionService {
  public readonly TILE_WIDTH = 64;
  public readonly TILE_HEIGHT = 32;
  public readonly TILE_HALF_WIDTH = 32;
  public readonly TILE_HALF_HEIGHT = 16;
  public readonly TILE_ASPECT_RATIO = 2;
  public readonly CHUNK_SIZE = 32;

  /** Pequeño épsilon para que el picking inverso no "baile" en bordes. */
  private readonly EPS = 1e-9;

  /** Vértice norte del diamante para el tile lógico (wx, wy). */
  tileToScreen(worldTileX: number, worldTileY: number): { screenX: number; screenY: number } {
    return {
      screenX: (worldTileX - worldTileY) * this.TILE_HALF_WIDTH,
      screenY: (worldTileX + worldTileY) * this.TILE_HALF_HEIGHT,
    };
  }

  /** Alias histórico: "world" aquí = tile lógico, no píxeles ortogonales. */
  worldToScreen(worldX: number, worldY: number): { screenX: number; screenY: number } {
    return this.tileToScreen(worldX, worldY);
  }

  /** Inversa exacta (flotante) de tileToScreen. */
  screenToTileFloat(screenX: number, screenY: number): { worldTileX: number; worldTileY: number } {
    const fx = screenX / this.TILE_HALF_WIDTH;
    const fy = screenY / this.TILE_HALF_HEIGHT;
    return {
      worldTileX: (fx + fy) / 2,
      worldTileY: (fy - fx) / 2,
    };
  }

  /** Alias histórico de la inversa exacta. */
  screenToWorld(screenX: number, screenY: number): { worldX: number; worldY: number } {
    const t = this.screenToTileFloat(screenX, screenY);
    return { worldX: t.worldTileX, worldY: t.worldTileY };
  }

  /**
   * Picking: pantalla -> tile entero. Se suma EPS antes de floor para que
   * un click exactamente sobre una arista caiga de forma determinista
   * dentro del diamante y no oscile por error de punto flotante.
   */
  screenToTile(screenX: number, screenY: number): { worldTileX: number; worldTileY: number } {
    const f = this.screenToTileFloat(screenX, screenY);
    return {
      worldTileX: Math.floor(f.worldTileX + this.EPS),
      worldTileY: Math.floor(f.worldTileY + this.EPS),
    };
  }

  /** Centro del diamante (útil para sprites / anclas). */
  tileCenter(worldTileX: number, worldTileY: number): { screenX: number; screenY: number } {
    const top = this.tileToScreen(worldTileX, worldTileY);
    return { screenX: top.screenX, screenY: top.screenY + this.TILE_HALF_HEIGHT };
  }

  /** Las 4 esquinas del diamante dado su vértice norte. */
  tileCorners(screenX: number, screenY: number): {
    n: { x: number; y: number };
    e: { x: number; y: number };
    s: { x: number; y: number };
    w: { x: number; y: number };
  } {
    return {
      n: { x: screenX, y: screenY },
      e: { x: screenX + this.TILE_HALF_WIDTH, y: screenY + this.TILE_HALF_HEIGHT },
      s: { x: screenX, y: screenY + this.TILE_HEIGHT },
      w: { x: screenX - this.TILE_HALF_WIDTH, y: screenY + this.TILE_HALF_HEIGHT },
    };
  }

  /** Vértice norte del chunk (cx, cy): idéntico a tileToScreen(cx*S, cy*S). */
  chunkOriginTop(chunkX: number, chunkY: number): { screenX: number; screenY: number } {
    return this.tileToScreen(chunkX * this.CHUNK_SIZE, chunkY * this.CHUNK_SIZE);
  }

  /**
   * Tile local -> pantalla pasando por el origen del chunk.
   * Por construcción es EXACTAMENTE igual a
   * tileToScreen(cx*S + lx, cy*S + ly): esa igualdad es la garantía
   * matemática de que los diamantes pequeños forman el chunk grande
   * sin gaps ni solapes.
   */
  tileToScreenViaChunk(
    chunkX: number,
    chunkY: number,
    localX: number,
    localY: number,
  ): { screenX: number; screenY: number } {
    const o = this.chunkOriginTop(chunkX, chunkY);
    return {
      screenX: o.screenX + (localX - localY) * this.TILE_HALF_WIDTH,
      screenY: o.screenY + (localX + localY) * this.TILE_HALF_HEIGHT,
    };
  }

  /** Alias corregido del método histórico (misma semántica, math arreglada). */
  localToScreen(
    chunkX: number,
    chunkY: number,
    localX: number,
    localY: number,
  ): { screenX: number; screenY: number } {
    return this.tileToScreenViaChunk(chunkX, chunkY, localX, localY);
  }

  /** Pantalla -> { chunk, local }. Inversa exacta de tileToScreenViaChunk. */
  screenToChunkLocal(screenX: number, screenY: number): {
    chunkX: number;
    chunkY: number;
    localX: number;
    localY: number;
    worldTileX: number;
    worldTileY: number;
  } {
    const t = this.screenToTile(screenX, screenY);
    const chunkX = Math.floor(t.worldTileX / this.CHUNK_SIZE);
    const chunkY = Math.floor(t.worldTileY / this.CHUNK_SIZE);
    return {
      chunkX,
      chunkY,
      localX: t.worldTileX - chunkX * this.CHUNK_SIZE,
      localY: t.worldTileY - chunkY * this.CHUNK_SIZE,
      worldTileX: t.worldTileX,
      worldTileY: t.worldTileY,
    };
  }

  /** Alias corregido del método histórico. */
  screenToLocal(screenX: number, screenY: number): {
    chunkX: number;
    chunkY: number;
    localX: number;
    localY: number;
  } {
    const r = this.screenToChunkLocal(screenX, screenY);
    return { chunkX: r.chunkX, chunkY: r.chunkY, localX: r.localX, localY: r.localY };
  }

  /** Diamante envolvente del chunk: sus 4 vértices caen sobre vértices de tiles. */
  chunkCorners(chunkX: number, chunkY: number): {
    n: { x: number; y: number };
    e: { x: number; y: number };
    s: { x: number; y: number };
    w: { x: number; y: number };
  } {
    const o = this.chunkOriginTop(chunkX, chunkY);
    const S = this.CHUNK_SIZE;
    return {
      n: { x: o.screenX, y: o.screenY },
      e: { x: o.screenX + S * this.TILE_HALF_WIDTH, y: o.screenY + S * this.TILE_HALF_HEIGHT },
      s: { x: o.screenX, y: o.screenY + S * this.TILE_HEIGHT },
      w: { x: o.screenX - S * this.TILE_HALF_WIDTH, y: o.screenY + S * this.TILE_HALF_HEIGHT },
    };
  }

  /** Tamaño en pantalla del diamante de un chunk completo. */
  chunkScreenSize(): { width: number; height: number } {
    return {
      width: this.CHUNK_SIZE * this.TILE_WIDTH,
      height: this.CHUNK_SIZE * this.TILE_HEIGHT,
    };
  }

  /**
   * Genera una cuadrícula isométrica perfecta en SVG (terreno de prueba).
   * Todos los vértices son enteros (sin sub-píxel), cada diamante mide
   * exactamente 64x32 y los bordes de chunk coinciden con aristas de tiles.
   * Útil como "textura de referencia" para validar el renderer del cliente.
   */
  toSvgGrid(
    chunksX = 2,
    chunksY = 2,
    colors = ['#7ec850', '#74bd49'],
    opts: { borders?: boolean; tileStroke?: string | null } = {},
  ): string {
    const S = this.CHUNK_SIZE;
    const showBorders = opts.borders ?? true;
    const stroke = opts.tileStroke === undefined ? '#2f6b2f' : (opts.tileStroke ?? 'none');
    const minX = -chunksY * S * this.TILE_HALF_WIDTH - this.TILE_HALF_WIDTH;
    const maxX = chunksX * S * this.TILE_HALF_WIDTH + this.TILE_HALF_WIDTH;
    const maxY = (chunksX + chunksY) * S * this.TILE_HALF_HEIGHT + this.TILE_HEIGHT;
    const width = maxX - minX;
    const height = maxY + this.TILE_HALF_HEIGHT;
    const ox = -minX;
    const oy = this.TILE_HALF_HEIGHT;

    let tiles = '';
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        for (let ly = 0; ly < S; ly++) {
          for (let lx = 0; lx < S; lx++) {
            const p = this.tileToScreenViaChunk(cx, cy, lx, ly);
            const c = this.tileCorners(p.screenX + ox, p.screenY + oy);
            // Paridad GLOBAL (no local): el ajedrez no cambia de fase en la
            // frontera entre chunks; tiles adyacentes siempre alternan color.
            const fill = colors[(cx * S + lx + cy * S + ly) % colors.length];
            tiles += `<polygon points="${c.n.x},${c.n.y} ${c.e.x},${c.e.y} ${c.s.x},${c.s.y} ${c.w.x},${c.w.y}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
          }
        }
      }
    }

    let borders = '';
    if (showBorders) {
      for (let cy = 0; cy < chunksY; cy++) {
        for (let cx = 0; cx < chunksX; cx++) {
          const k = this.chunkCorners(cx, cy);
          const sh = (pt: { x: number; y: number }) => `${pt.x + ox},${pt.y + oy}`;
          borders += `<polygon points="${sh(k.n)} ${sh(k.e)} ${sh(k.s)} ${sh(k.w)}" fill="none" stroke="#ff3b30" stroke-width="3"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${tiles}${borders}</svg>`;
  }
}
