// Ver nota en isometric-projection.service.spec.ts: se mockea el decorador porque
// el jest de este repo no carga el @nestjs/common real.
jest.mock('@nestjs/common', () => ({ Injectable: () => () => undefined }));

import { ChunkGeneratorService, DEFAULT_WORLD_SEED } from './chunk-generator.service';
import { IsometricProjectionService } from './isometric-projection.service';

const MINERAL_GIDS = new Set([30, 31, 32, 33, 34, 35]);

function gen() {
  return new ChunkGeneratorService(new IsometricProjectionService());
}

describe('ChunkGeneratorService (backend = fuente única, determinista por seed)', () => {
  it('misma seed => mismos tiles y recursos (dos instancias distintas)', () => {
    const a = gen().generate(2, 3, 'seed_abc123');
    const b = gen().generate(2, 3, 'seed_abc123');
    expect(a).toEqual(b);
  });

  it('seeds distintas => mundos distintos', () => {
    const a = gen().generate(0, 0, 'mundo-A');
    const b = gen().generate(0, 0, 'mundo-B');
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles));
  });

  it('acepta seed numérica y string sin romper', () => {
    const g = gen();
    expect(() => g.generate(0, 0, 1337)).not.toThrow();
    expect(() => g.generate(0, 0, DEFAULT_WORLD_SEED)).not.toThrow();
    expect(() => g.generate(0, 0)).not.toThrow();
  });

  it('minerales al cuarto: fracción pequeña del mundo 6x6', () => {
    const g = gen();
    let mineral = 0;
    let total = 0;
    for (let cy = 0; cy < 6; cy++) {
      for (let cx = 0; cx < 6; cx++) {
        const { tiles } = g.generate(cx, cy, 'medicion-minerales') as { tiles: number[][] };
        for (const row of tiles) {
          for (const gid of row) {
            total++;
            if (MINERAL_GIDS.has(gid)) mineral++;
          }
        }
      }
    }
    expect(total).toBe(192 * 192);
    const frac = mineral / total;
    // Objetivo ~3.8% (0.2125 rarity total * 0.18 escala); margen amplio anti-flaky.
    expect(frac).toBeGreaterThan(0.005);
    expect(frac).toBeLessThan(0.06);
  });

  it('contrato 32x32 y recursos dentro del chunk', () => {
    const { tiles, resources } = gen().generate(1, 1, 'contrato') as {
      tiles: number[][];
      resources: Array<{ posX: number; posY: number; chunkLocalX: number; chunkLocalY: number }>;
    };
    expect(tiles).toHaveLength(32);
    for (const row of tiles) expect(row).toHaveLength(32);
    for (const r of resources) {
      expect(r.posX).toBeGreaterThanOrEqual(1024);
      expect(r.posX).toBeLessThan(2048);
      expect(r.chunkLocalX).toBeGreaterThanOrEqual(0);
      expect(r.chunkLocalX).toBeLessThan(32);
    }
  });
});
