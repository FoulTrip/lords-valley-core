// El jest de este repo no puede cargar el @nestjs/common real (falla también
// con cualquier otro servicio Nest: limitación preexistente). Mockeamos solo
// el decorador; la matemática bajo test es la real del servicio.
jest.mock('@nestjs/common', () => ({ Injectable: () => () => undefined }));

import { IsometricProjectionService } from './isometric-projection.service';
import { ChunkGeneratorService } from './chunk-generator.service';

describe('IsometricProjectionService (2:1 puro, cuadrícula perfecta)', () => {
  const iso = new IsometricProjectionService();

  it('mantiene relación de aspecto exacta 2:1', () => {
    expect(iso.TILE_WIDTH).toBe(iso.TILE_HEIGHT * 2);
    expect(iso.TILE_HALF_WIDTH).toBe(iso.TILE_WIDTH / 2);
    expect(iso.TILE_HALF_HEIGHT).toBe(iso.TILE_HEIGHT / 2);
    expect(iso.TILE_WIDTH / iso.TILE_HEIGHT).toBe(2);
  });

  it('proyecta el origen y los ejes sin distorsión', () => {
    expect(iso.tileToScreen(0, 0)).toEqual({ screenX: 0, screenY: 0 });
    expect(iso.tileToScreen(1, 0)).toEqual({ screenX: 32, screenY: 16 });
    expect(iso.tileToScreen(0, 1)).toEqual({ screenX: -32, screenY: 16 });
    expect(iso.tileToScreen(1, 1)).toEqual({ screenX: 0, screenY: 32 });
  });

  it('round-trip pantalla <-> tile en rango amplio (incluye negativos)', () => {
    for (let x = -40; x <= 40; x++) {
      for (let y = -40; y <= 40; y++) {
        const s = iso.tileToScreen(x, y);
        // El vértice norte cae justo en la arista: el picking con EPS
        // debe resolver al mismo tile de forma determinista.
        const back = iso.screenToTile(s.screenX, s.screenY);
        expect(back).toEqual({ worldTileX: x, worldTileY: y });
        // El centro del diamante siempre resuelve al tile propio.
        const c = iso.tileCenter(x, y);
        expect(iso.screenToTile(c.screenX, c.screenY)).toEqual({ worldTileX: x, worldTileY: y });
      }
    }
  });

  it('los diamantes vecinos comparten aristas vértice a vértice (sin gaps)', () => {
    const a = iso.tileCorners(iso.tileToScreen(0, 0).screenX, iso.tileToScreen(0, 0).screenY);
    const bTop = iso.tileToScreen(1, 0);
    const b = iso.tileCorners(bTop.screenX, bTop.screenY);
    // Arista E-S de (0,0) == arista N-W de (1,0), extremos cruzados.
    expect(b.n).toEqual(a.e);
    expect(b.w).toEqual(a.s);

    const cTop = iso.tileToScreen(0, 1);
    const c = iso.tileCorners(cTop.screenX, cTop.screenY);
    expect(c.n).toEqual(a.w);
    expect(c.e).toEqual(a.s);
  });

  it('vía chunk == directo para todo tile local (alineación chunk garantizada)', () => {
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [-1, -1], [5, 3]] as const) {
      for (let ly = 0; ly < 32; ly++) {
        for (let lx = 0; lx < 32; lx++) {
          const direct = iso.tileToScreen(cx * 32 + lx, cy * 32 + ly);
          const via = iso.tileToScreenViaChunk(cx, cy, lx, ly);
          expect(via).toEqual(direct);
        }
      }
    }
  });

  it('las esquinas del chunk caen sobre vértices de tiles (borde alineado)', () => {
    const k = iso.chunkCorners(0, 0);
    expect(k.n).toEqual({ x: 0, y: 0 });
    expect(k.e).toEqual({ x: 32 * 32, y: 32 * 16 });
    expect(k.s).toEqual({ x: 0, y: 32 * 32 });
    expect(k.w).toEqual({ x: -32 * 32, y: 32 * 16 });
    // E del chunk == N del tile (32, 0); S == N del (32, 32)... vértices exactos.
    expect(k.e).toEqual({ x: iso.tileToScreen(32, 0).screenX, y: iso.tileToScreen(32, 0).screenY });
  });

  it('screenToChunkLocal invierte tileToScreenViaChunk', () => {
    for (const [cx, cy, lx, ly] of [[0, 0, 0, 0], [0, 0, 31, 31], [2, -1, 5, 27], [-2, 3, 31, 0]] as const) {
      const s = iso.tileToScreenViaChunk(cx, cy, lx, ly);
      const back = iso.screenToChunkLocal(s.screenX, s.screenY);
      expect(back).toMatchObject({ chunkX: cx, chunkY: cy, localX: lx, localY: ly });
    }
  });

  it('el SVG de referencia usa solo coordenadas enteras y diamantes 64x32', () => {
    const svg = iso.toSvgGrid(1, 1);
    const nums = [...svg.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
    expect(nums.length).toBeGreaterThan(0);
    expect(nums.every(Number.isInteger)).toBe(true);
    // Cada tile aporta un polígono de 8 números; el chunk aporta el borde.
    expect(svg).toContain('<polygon');
  });

  it('los bordes de chunk del SVG caen sobre aristas de tiles, nunca en interiores', () => {
    const svg = iso.toSvgGrid(2, 2);
    const reds = [...svg.matchAll(/<polygon points="([^"]+)"[^>]*stroke="#ff3b30"[^>]*>/g)];
    expect(reds.length).toBe(4);
    // Chequeo real en coords de pantalla (sin offset): el punto medio de cada
    // arista de chunk debe estar a distancia 1 (arista) de algún diamante.
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const k = iso.chunkCorners(cx, cy);
      const edges = [[k.n, k.e], [k.e, k.s], [k.s, k.w], [k.w, k.n]] as const;
      for (const [P, Q] of edges) {
        const M = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
        let onEdge = false,
          inside = false;
        for (let x = 0; x < 64 && !inside; x++)
          for (let y = 0; y < 64 && !inside; y++) {
            const t = iso.tileToScreen(x, y);
            const v = Math.abs(M.x - t.screenX) / 32 + Math.abs(M.y - (t.screenY + 16)) / 16;
            if (v < 1 - 1e-9) inside = true;
            else if (Math.abs(v - 1) < 1e-9) onEdge = true;
          }
        expect(inside).toBe(false);
        expect(onEdge).toBe(true);
      }
    }
  });

  it('el ajedrez no cambia de fase en la frontera entre chunks', () => {
    const svg = iso.toSvgGrid(2, 1, ['#7ec850', '#74bd49']);
    const fills = [...svg.matchAll(/<polygon points="[^"]+" fill="([^"]+)"/g)].map((m) => m[1]);
    // Orden: cy, cx, ly, lx. Tile (31,0) del chunk 0 vs tile (32,0)=local(0,0) chunk 1.
    const idx = (cx: number, lx: number, ly: number) => cx * 32 * 32 + ly * 32 + lx;
    expect(fills[idx(0, 31, 0)]).not.toBe(fills[idx(1, 0, 0)]);
    expect(fills[idx(0, 31, 5)]).not.toBe(fills[idx(1, 0, 5)]);
  });

  it('opts.borders=false genera textura limpia sin overlay rojo', () => {
    const svg = iso.toSvgGrid(2, 2, ['#7ec850', '#74bd49'], { borders: false });
    expect(svg).not.toContain('#ff3b30');
    expect(svg.match(/<polygon/g)?.length).toBe(2 * 2 * 32 * 32);
  });
});

describe('ChunkGeneratorService (contrato ortogonal intacto + helpers iso)', () => {
  const gen = new ChunkGeneratorService(new IsometricProjectionService());

  it('worldToChunk respeta worldX = chunkX*1024 + localX*32', () => {
    expect(gen.worldToChunk(0, 0)).toEqual({ chunkX: 0, chunkY: 0, localX: 0, localY: 0 });
    expect(gen.worldToChunk(1024, 1024)).toEqual({ chunkX: 1, chunkY: 1, localX: 0, localY: 0 });
    expect(gen.worldToChunk(1024 + 31 * 32 + 5, 2 * 32 + 7)).toEqual({
      chunkX: 1,
      chunkY: 0,
      localX: 31,
      localY: 2,
    });
  });

  it('chunkToWorld es inversa ortogonal exacta', () => {
    expect(gen.chunkToWorld(1, 2, 3, 4)).toEqual({ worldX: 1024 + 96, worldY: 2048 + 128 });
  });

  it('los recursos caen dentro del chunk ortogonal de 1024px', () => {
    const { resources } = gen.generate(2, 3, 1337) as { resources: Array<{ posX: number; posY: number }> };
    for (const r of resources) {
      expect(r.posX).toBeGreaterThanOrEqual(2 * 1024);
      expect(r.posX).toBeLessThan(3 * 1024);
      expect(r.posY).toBeGreaterThanOrEqual(3 * 1024);
      expect(r.posY).toBeLessThan(4 * 1024);
    }
  });

  it('chunkLocalToScreen coincide con la proyección del tile global', () => {
    const s = gen.chunkLocalToScreen(1, 0, 4, 7);
    const iso = new IsometricProjectionService();
    expect(s).toEqual(iso.tileToScreen(1 * 32 + 4, 0 * 32 + 7));
  });
});
