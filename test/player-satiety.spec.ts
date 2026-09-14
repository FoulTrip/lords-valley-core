import { PlayerService } from '../src/player/player.service';

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

describe('Saciedad del player (Pan/Odre con Agua)', () => {
  it('usar 1 de un stack x9 deja x8 en EL MISMO stack', async () => {
    const prisma = mockPrisma({
      game: { needs: { hunger: 80, thirst: 80, updatedAt: Date.now() } },
    });
    const svc = new PlayerService(prisma as never);
    const inv = await svc.addItem('p1', { nombre: 'Pan', cantidad: 9 });
    const pan = inv.find((s) => s.nombre === 'Pan')!;
    expect(pan.cantidad).toBe(9);
    const res = await svc.useItem('p1', pan.id);
    expect((res as any).needs.hunger).toBe(60);
    const after = (res as any).inventory as typeof inv;
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(pan.id);
    expect(after[0].cantidad).toBe(8);
  });

  it('usar no toca otros stacks del mismo item', async () => {
    const prisma = mockPrisma({
      game: { needs: { hunger: 80, thirst: 0, updatedAt: Date.now() } },
    });
    const svc = new PlayerService(prisma as never);
    // 10 + 5 con maxStack 10 -> stackA x10, stackB x5
    await svc.addItem('p1', { nombre: 'Pan', cantidad: 9 });
    const inv = await svc.addItem('p1', { nombre: 'Pan', cantidad: 6 });
    expect(inv).toHaveLength(2);
    const stackB = inv.find((s) => s.cantidad === 5)!;
    const stackA = inv.find((s) => s.id !== stackB.id)!;
    const res = await svc.useItem('p1', stackB.id);
    const after = (res as any).inventory as typeof inv;
    expect(after.find((s) => s.id === stackA.id)!.cantidad).toBe(10);
    expect(after.find((s) => s.id === stackB.id)!.cantidad).toBe(4);
  });

  it('usar la ultima unidad elimina el stack pero aplica saciedad', async () => {
    const prisma = mockPrisma({
      game: { needs: { hunger: 25, thirst: 0, updatedAt: Date.now() } },
    });
    const svc = new PlayerService(prisma as never);
    const inv = await svc.addItem('p1', { nombre: 'Pan', cantidad: 1 });
    const res = await svc.useItem('p1', inv[0].id);
    expect((res as any).needs.hunger).toBe(5);
    expect((res as any).inventory).toHaveLength(0);
  });

  it('usar Odre con Agua baja sed 20 y deja Odre vacio', async () => {
    const prisma = mockPrisma({
      game: { needs: { hunger: 0, thirst: 70, updatedAt: Date.now() } },
    });
    const svc = new PlayerService(prisma as never);
    const inv = await svc.addItem('p1', { nombre: 'OdreAgua', cantidad: 1 });
    expect(inv.find((s) => s.nombre === 'Odre con Agua')).toBeTruthy();
    const odre = inv.find((s) => s.nombre === 'Odre con Agua')!;
    const res = await svc.useItem('p1', odre.id);
    expect((res as any).needs.thirst).toBe(50);
    expect((res as any).needs.hunger).toBe(0);
    const inv2 = await svc.getInventory('p1');
    expect(inv2.find((s) => s.nombre === 'Odre vacío')!.cantidad).toBe(1);
  });

  it('addItem:Bebida/OdreAgua alias resuelve canonico', async () => {
    const prisma = mockPrisma({});
    const svc = new PlayerService(prisma as never);
    const inv = await svc.addItem('p1', { nombre: 'OdreAgua', cantidad: 3 });
    expect(inv[0].nombre).toBe('Odre con Agua');
  });
});
