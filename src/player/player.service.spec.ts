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

  it('acepta Residuo Vegetal y Fertilizante (compostaje) como Recursos en Bruto', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const invW = await svc.addItem('p1', { nombre: 'residuo vegetal', cantidad: 3 });
    expect(invW).toHaveLength(1);
    expect(invW[0].nombre).toBe('Residuo Vegetal');
    expect(invW[0].categoria).toBe('Recursos en Bruto');
    expect(invW[0].icono).toBe('🍂');
    const invF = await svc.addItem('p1', { nombre: 'Fertilizante', cantidad: 1 });
    expect(invF).toHaveLength(2);
    expect(invF[1].nombre).toBe('Fertilizante');
    expect(invF[1].icono).toBe('💩');
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

  it('equipa casco, botas y guantes en su slot y persisten al recargar', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    for (const nombre of ['Casco', 'Botas de Cuero', 'Guantes']) {
      const inv = await svc.addItem('p1', { nombre, cantidad: 1 });
      const res = await svc.equipItem('p1', inv[inv.length - 1].id);
      expect(res.slot).toBe(nombre === 'Casco' ? 'casco' : nombre === 'Botas de Cuero' ? 'botas' : 'guantes');
    }
    const eq = await svc.getEquipment('p1');
    expect(eq.helmet).toBe('Casco');
    expect(eq.boots).toBe('Botas de Cuero');
    expect(eq.gloves).toBe('Guantes');
    // Simula recarga (nueva instancia lee el mismo settings persistido):
    // sanitize debe conservar los nombres, igual que arma y armadura.
    const svc2 = new PlayerService(prisma as never, mockCombat() as never);
    const eq2 = await svc2.getEquipment('p1');
    expect(eq2.helmet).toBe('Casco');
    expect(eq2.boots).toBe('Botas de Cuero');
    expect(eq2.gloves).toBe('Guantes');
  });

  it('la Capa va en el slot "capa", no en "armadura", y persiste al recargar', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.addItem('p1', { nombre: 'Capa', cantidad: 1 });
    const res = await svc.equipItem('p1', inv[0].id);
    expect(res.slot).toBe('capa');
    expect(res.equipment.cape).toBe('Capa');
    expect(res.equipment.armor).toBeNull();
    const svc2 = new PlayerService(prisma as never, mockCombat() as never);
    const eq2 = await svc2.getEquipment('p1');
    expect(eq2.cape).toBe('Capa');
    // Desequipar la capa la devuelve al inventario
    const un = await svc2.unequipSlot('p1', 'capa');
    expect(un.equipment.cape).toBeNull();
    expect(un.inventory.some((s) => s.nombre === 'Capa')).toBe(true);
  });

  it('la Cota de Malla sigue yendo a "armadura"', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.addItem('p1', { nombre: 'Cota de Malla', cantidad: 1 });
    const res = await svc.equipItem('p1', inv[0].id);
    expect(res.slot).toBe('armadura');
    expect(res.equipment.armor).toBe('Cota de Malla');
  });

  it('el Escudo se equipa en "escudo" con calidad y engarces, y persiste', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.addItem('p1', { nombre: 'Escudo', cantidad: 1, calidad: 'raro' });
    expect(inv[0].calidad).toBe('raro');
    expect(inv[0].sockets).toEqual({ encantamientos: [], runas: [], gemas: [] });
    const res = await svc.equipItem('p1', inv[0].id);
    expect(res.slot).toBe('escudo');
    expect(res.equipment.shield).toBe('Escudo');
    expect(res.equipment.shieldCalidad).toBe('raro');
    const svc2 = new PlayerService(prisma as never, mockCombat() as never);
    const eq2 = await svc2.getEquipment('p1');
    expect(eq2.shield).toBe('Escudo');
    expect(eq2.shieldCalidad).toBe('raro');
    expect(eq2.shieldSockets).toEqual({ encantamientos: [], runas: [], gemas: [] });
  });

  it('los engarces se sanean al leer y viajan al equipar/desequipar', async () => {
    const prisma = mockPrisma({
      game: {
        inventory: [{
          id: 's1', nombre: 'Escudo', categoria: 'Equipo', cantidad: 1,
          maxStack: 1, stackable: false,
          sockets: { encantamientos: ['Filo ígneo', 42, '', 'x'.repeat(100)], runas: ['Runa lobo'], gemas: 'no-array', otro: [1] },
        }],
      },
    });
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const inv = await svc.getInventory('p1');
    expect(inv[0].sockets).toEqual({ encantamientos: ['Filo ígneo', 'x'.repeat(60)], runas: ['Runa lobo'], gemas: [] });
    const res = await svc.equipItem('p1', 's1');
    expect(res.equipment.shieldSockets).toEqual({ encantamientos: ['Filo ígneo', 'x'.repeat(60)], runas: ['Runa lobo'], gemas: [] });
    const un = await svc.unequipSlot('p1', 'escudo');
    expect(un.equipment.shield).toBeNull();
    expect(un.inventory.find((s) => s.nombre === 'Escudo')?.sockets).toEqual(
      { encantamientos: ['Filo ígneo', 'x'.repeat(60)], runas: ['Runa lobo'], gemas: [] },
    );
  });

  it('la Poción de Furia daña con bonus temporal y la de Invisibilidad bufa 10s', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never, mockCombat() as never);
    const invF = await svc.addItem('p1', { nombre: 'Poción de Furia', cantidad: 1 });
    const usedF = await svc.useItem('p1', { stackId: invF[0].id });
    expect(usedF.effect).toMatch(/furia/i);
    const fury = (usedF as { buffs: { kind: string; value: number; expiresAt: number }[] }).buffs
      .find((b) => b.kind === 'damage_boost');
    expect(fury?.value).toBe(30);
    expect(fury!.expiresAt).toBeGreaterThan(Date.now() + 20_000);
    const invI = await svc.addItem('p1', { nombre: 'Poción de Invisibilidad', cantidad: 1 });
    const usedI = await svc.useItem('p1', { stackId: invI[0].id });
    expect(usedI.effect).toMatch(/invisible/i);
    const buffs = await svc.getBuffs('p1');
    const kinds = buffs.map((b) => b.kind);
    expect(kinds).toContain('damage_boost');
    expect(kinds).toContain('invisible');
    const invis = buffs.find((b) => b.kind === 'invisible')!;
    expect(invis.expiresAt).toBeGreaterThan(Date.now());
    expect(invis.expiresAt).toBeLessThanOrEqual(Date.now() + 11_000);
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
