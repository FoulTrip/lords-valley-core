import { PrismaClient, SettlementTier, Gender, ProfessionType, TaskStatus, JobRole, BuildingType, BuildingCategory, ResourceType, EventType } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

function qty(n: number): string {
  return (BigInt(n) * BigInt(1e18)).toString();
}

function makeSurvivor(firstName: string, lastName: string, gender: Gender, profession: ProfessionType, loyalty: number) {
  const id = randomUUID();
  return {
    id,
    firstName,
    lastName,
    gender,
    age: 20 + Math.floor(Math.random() * 20),
    birthDay: 1 + Math.floor(Math.random() * 30),
    birthMonth: 1 + Math.floor(Math.random() * 12),
    birthYear: 980 + Math.floor(Math.random() * 20),
    loyalty,
    isLoyalAbsolute: loyalty === 100,
    loyaltyHistory: [] as any[],
    attributes: {
      strength: 10 + Math.floor(Math.random() * 8),
      agility: 10 + Math.floor(Math.random() * 8),
      endurance: 10 + Math.floor(Math.random() * 8),
      intelligence: 10 + Math.floor(Math.random() * 8),
      charisma: 10 + Math.floor(Math.random() * 8),
      perception: 10 + Math.floor(Math.random() * 8),
    },
    professions: [
      { type: profession, level: 1 + Math.floor(Math.random() * 3), experience: qty(Math.floor(Math.random() * 100)), specializations: [] as string[] },
    ],
    needs: { hunger: Math.floor(Math.random() * 20), thirst: Math.floor(Math.random() * 15), fatigue: Math.floor(Math.random() * 10), health: 100, sanity: 100, safety: 60 },
    currentTask: TaskStatus.IDLE,
    assignedJob: JobRole.TRABAJADOR,
    // RTS 6144 centro 3072, survivors cerca del player (no en 800 off-screen)
    positionX: 3072 + (Math.random() - 0.5) * 400,
    positionY: 3072 + (Math.random() - 0.5) * 400,
    superiorId: null as string | null,
    lvyBalance: qty(Math.floor(Math.random() * 10)),
    inventory: [
      { id: randomUUID(), type: ResourceType.HERRAMIENTAS, quantity: qty(1), weight: 2.5 },
    ],
    maxCarryWeight: 50,
    currentWeight: 2.5,
    socialLinks: [] as any[],
  };
}

async function main() {
  console.log('Seeding Lords Valley... (modo dinámico: sin usuario mock, creación via POST /auth/register)');
  console.log('No se crea Player TestLord ni Settlement — se crean dinámicamente al registrarse vía UI (localStorage auth).');
  // Nota: Settlement con survivors/buildings/inventory se crea automáticamente en SettlementRepository.create() al hacer POST /settlements

  // Generar 9 chunks alrededor de (0,0) - lazy: si falla import, no bloquea settlement
  let generator: any = null;
  try {
    const gen = (await import('../src/map-chunks/services/chunk-generator.service.js')).ChunkGeneratorService;
    generator = new gen();
  } catch (e) {
    console.warn('[seed] ChunkGenerator no cargado, chunks se generarán lazy via GET /map/chunks', (e as Error).message);
  }
  if (generator) {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        const exists = await prisma.globalMapChunk.findUnique({ where: { chunkX_chunkY: { chunkX: x, chunkY: y } } });
        if (!exists) {
          const { tiles, resources } = generator.generate(x, y);
          await prisma.globalMapChunk.create({ data: { chunkX: x, chunkY: y, tiles: tiles as any, resources: resources as any, isExplored: x === 0 && y === 0 } });
          console.log(`Chunk ${x},${y} generado`);
        }
      }
    }
  }

  console.log('Seed completado');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
