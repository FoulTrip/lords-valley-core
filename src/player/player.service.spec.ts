import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

jest.mock('@nestjs/common', () => {
  class HttpException extends Error {
    constructor(message?: string) {
      super(message);
    }
  }
  class BadRequestException extends HttpException {}
  class ForbiddenException extends HttpException {}
  class NotFoundException extends HttpException {}
  return {
    Injectable: () => () => undefined,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
  };
});

function mockPrisma(initialSettings: unknown) {
  let settings: any = initialSettings;
  return {
    player: {
      findUnique: jest.fn(async () => ({ id: 'p1', settings })),
      update: jest.fn(async (args: any) => {
        settings = args.data.settings;
        return { id: 'p1', settings };
      }),
    },
    __get: () => settings,
  };
}

function mockCombat() {
  return {
    healEntity: jest.fn(() => ({ applied: true, hp: 200, maxHp: 200 })),
    addMana: jest.fn(() => ({ applied: true, mana: 100, maxMana: 100 })),
    syncLoadoutBuffs: jest.fn(),
    findTargetRecord: jest.fn(() => ({ dots: [], buffs: [] })),
    cleanseEntity: jest.fn(() => 0),
    applyScrollAoe: jest.fn(() => ({ hits: [] })),
  };
}

describe('PlayerService (autoridad del servidor)', () => {
  it('rechaza cantidad fuera de 1-999', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await expect(svc.addItem('p1', { nombre: 'Madera', cantidad: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.addItem('p1', { nombre: 'Madera', cantidad: 1000 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.player.update).not.toHaveBeenCalled();
  });

  it('rechaza item fuera de catálogo', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await expect(svc.addItem('p1', { nombre: 'Espada Láser', cantidad: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('acepta nombre insensible a mayúsculas y guarda canónico', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.addItem('p1', { nombre: 'MADERA', cantidad: 5 });
    expect(inv).toHaveLength(1);
    expect(inv[0].nombre).toBe('Madera');
    expect(inv[0].cantidad).toBe(5);
    expect(inv[0].categoria).toBe('Recursos en Bruto');
  });

  it('resuelve alias de escuela EN y añade pergaminos', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.addItem('p1', { escuela: 'survival', cantidad: 5 });
    expect(inv).toHaveLength(1);
    expect(inv[0].nombre).toBe('Pergamino de Entrenamiento: Supervivencia');
    expect(inv[0].cantidad).toBe(5);
  });

  it('entrenar sin pergamino no muta nada', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await expect(svc.train('p1', { escuela: 'supervivencia' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.player.update).not.toHaveBeenCalled();
  });

  it('entrenar consume 1 pergamino y suma +10 XP en servidor', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await svc.addItem('p1', { escuela: 'supervivencia', cantidad: 2 });
    const res = await svc.train('p1', { escuela: 'supervivencia' });
    expect(res.xp).toBe(10);
    for (const sk of res.skills.supervivencia) expect(sk.xp).toBe(10);
    const scrolls = res.inventory.filter((s) =>
      s.nombre.includes('Supervivencia'),
    );
    expect(scrolls.reduce((a, s) => a + s.cantidad, 0)).toBe(1);
  });

  it('usar stack de arma no consume (403)', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.addItem('p1', { nombre: 'Daga', cantidad: 1 });
    await expect(svc.useItem('p1', { stackId: inv[0].id })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await svc.getInventory('p1')).toHaveLength(1);
  });

  it('eliminar stack ajeno no existe', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await expect(svc.removeStack('p1', 'pl_inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sanea estado corrupto al leer', async () => {    const prisma = mockPrisma({
      game: {
        inventory: [{ nombre: 'Madera' }, { id: 'x', nombre: 'Madera', categoria: 'Recursos en Bruto', cantidad: 3 }],
        skills: { supervivencia: [{ id: 'hack', level: 999, xp: 999 }] },
      },
    });
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    expect(await svc.getInventory('p1')).toHaveLength(1);
    const skills = await svc.getSkills('p1');
    expect(skills.supervivencia.every((s) => s.level === 0 && s.xp === 0)).toBe(true);
  });

  it('dev inicia con godMode apagado', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await expect(svc.getDev('p1')).resolves.toEqual({ godMode: false });
  });

  it('godmode on/off persiste y se sanea', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    await expect(svc.setGodMode('p1', true)).resolves.toEqual({ godMode: true });
    await expect(svc.getDev('p1')).resolves.toEqual({ godMode: true });
    await expect(svc.setGodMode('p1', false)).resolves.toEqual({ godMode: false });
    const dirty = mockPrisma({ game: { dev: { godMode: 'si' } } });
    const svc2 = new PlayerService(dirty as never, mockCombat() as never);
    await expect(svc2.getDev('p1')).resolves.toEqual({ godMode: false });
  });

  it('fullmode pone nivel máximo en las 48 habilidades', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const skills = await svc.grantFullMode('p1');
    const all = Object.values(skills).flat();
    expect(all).toHaveLength(48);
    for (const sk of all) {
      expect(sk.level).toBe(100);
      expect(sk.xp).toBe(0);
      expect(sk.unlocked).toBe(true);
    }
  });

  it('spawn-allow valida kind y rango', () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    expect(svc.allowSpawn('npc', 10)).toEqual({ ok: true, kind: 'npc', count: 10 });
    expect(svc.allowSpawn('dead-dragon-ally', 5).ok).toBe(true);
    expect(svc.allowSpawn('dead-dragon-enemy', 1).ok).toBe(true);
    expect(svc.allowSpawn('ghost', 3).ok).toBe(true);
    expect(() => svc.allowSpawn('dragon', 1)).toThrow(BadRequestException);
    expect(() => svc.allowSpawn('npc', 0)).toThrow(BadRequestException);
    expect(() => svc.allowSpawn('npc', 11)).toThrow(BadRequestException);
    expect(() => svc.allowSpawn('dead-dragon-ally', 6)).toThrow(BadRequestException);
    expect(() => svc.allowSpawn('ghost', 4)).toThrow(BadRequestException);
  });
});
