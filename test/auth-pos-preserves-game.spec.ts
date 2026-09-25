import { AuthService } from '../src/auth/services/auth.service';

jest.mock('@nestjs/common', () => {
  class HttpException extends Error {
    constructor(message?: string) {
      super(message);
    }
  }
  class BadRequestException extends HttpException {}
  class ConflictException extends HttpException {}
  class UnauthorizedException extends HttpException {}
  const noopDec = () => () => undefined;
  const noopParamDec = () => () => () => undefined;
  return {
    Injectable: noopDec,
    Optional: noopParamDec,
    Inject: noopParamDec,
    Global: noopDec,
    Module: noopDec,
    SetMetadata: () => noopDec,
    BadRequestException,
    ConflictException,
    UnauthorizedException,
  };
});

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

function mockPrisma(settings: any) {
  let stored: any = settings;
  return {
    player: {
      findUnique: jest.fn(async () => ({ id: 'p1', settings: stored, passwordHash: 'h' })),
      update: jest.fn(async (args: any) => {
        stored = args.data.settings;
        return { id: 'p1', settings: stored, passwordHash: 'h' };
      }),
    },
    __get: () => stored,
  };
}

describe('Autoguardado de posición (regresión: no debe borrar el inventario)', () => {
  it('updateLastPos conserva settings.game intacto', async () => {
    const game = {
      inventory: [
        { id: 's1', nombre: 'Pan', categoria: 'Comida y Bebida', cantidad: 8, maxStack: 10, stackable: true },
      ],
      needs: { hunger: 40, thirst: 10, updatedAt: Date.now() },
      dev: { godMode: false },
    };
    const prisma = mockPrisma({ lastPos: { x: 0, y: 0 }, game });
    const svc = new AuthService(prisma as never, {} as never);
    await svc.updateLastPos('p1', { x: 100, y: 200 });
    const saved = prisma.__get();
    expect(saved.lastPos).toEqual({ x: 100, y: 200 });
    expect(saved.lastSeen).toEqual(expect.any(String));
    // El estado autoritativo del módulo player sobrevive al guardado de posición
    expect(saved.game.inventory).toHaveLength(1);
    expect(saved.game.inventory[0]).toMatchObject({ nombre: 'Pan', cantidad: 8 });
    expect(saved.game.needs.hunger).toBe(40);
  });

  it('updateSettings (PATCH público) sigue ignorando la clave game', async () => {
    const prisma = mockPrisma({ game: { inventory: [] } });
    const svc = new AuthService(prisma as never, {} as never);
    await svc.updateSettings('p1', { game: { inventory: [{ nombre: 'hack' }] }, foo: 1 } as never);
    const saved = prisma.__get();
    // game se conserva del estado actual, no se sobrescribe con el payload
    expect(saved.game).toBeDefined();
    expect(saved.game.inventory).toHaveLength(0);
    expect((saved as any).foo).toBe(1);
  });
});
