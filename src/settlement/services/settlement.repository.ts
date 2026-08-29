import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementDomain } from '../domain/settlement.domain';
import { SettlementValidator } from '../domain/settlement.validator';
import { randomUUID } from 'crypto';

@Injectable()
export class SettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SettlementDomain | null> {
    const data = await this.prisma.settlement.findUnique({ where: { id } });
    return data ? new SettlementDomain(data) : null;
  }

  async findByOwnerId(ownerId: string): Promise<SettlementDomain[]> {
    const list = await this.prisma.settlement.findMany({ where: { ownerId } });
    return list.map((d) => new SettlementDomain(d));
  }

  async findAllActiveIds(): Promise<string[]> {
    const settlements = await this.prisma.settlement.findMany({
      select: { id: true },
    });
    return settlements.map((s) => s.id);
  }

  private makeDefaultSurvivor(firstName: string, lastName: string, profession: string) {
    const qty = (n: number) => (BigInt(n) * BigInt(10) ** BigInt(18)).toString();
    return {
      id: randomUUID(),
      firstName, lastName,
      gender: 'MASCULINO' as any,
      age: 22 + Math.floor(Math.random() * 10),
      birthDay: 1 + Math.floor(Math.random() * 28),
      birthMonth: 1 + Math.floor(Math.random() * 12),
      birthYear: 985 + Math.floor(Math.random() * 15),
      loyalty: 70 + Math.floor(Math.random() * 20),
      isLoyalAbsolute: false,
      loyaltyHistory: [],
      attributes: { strength: 10 + Math.floor(Math.random()*6), agility: 10+Math.floor(Math.random()*6), endurance: 10+Math.floor(Math.random()*6), intelligence: 10+Math.floor(Math.random()*6), charisma: 10+Math.floor(Math.random()*6), perception: 10+Math.floor(Math.random()*6) },
      professions: [{ type: profession as any, level: 1, experience: qty(0), specializations: [] }],
      needs: { hunger: 10, thirst: 10, fatigue: 5, health: 100, sanity: 100, safety: 70 },
      currentTask: 'IDLE' as any,
      assignedJob: 'TRABAJADOR' as any,
      positionX: 3072 + (Math.random() - 0.5) * 300,
      positionY: 3072 + (Math.random() - 0.5) * 300,
      superiorId: null,
      lvyBalance: qty(0),
      inventory: [{ id: randomUUID(), type: 'HERRAMIENTAS' as any, quantity: qty(1), weight: 2.5 }],
      maxCarryWeight: 50, currentWeight: 2.5, socialLinks: [],
    };
  }

  async create(data: {
    name: string;
    ownerId: string;
    tier?: string;
  }): Promise<SettlementDomain> {
    const qty = (n: number) => (BigInt(n) * BigInt(10) ** BigInt(18)).toString();
    const survivors = [
      this.makeDefaultSurvivor('Aric', 'Stonehand', 'LENADOR'),
      this.makeDefaultSurvivor('Elara', 'Dawnfield', 'MEDICO'),
      this.makeDefaultSurvivor('Brom', 'Ironfoot', 'MINERO'),
    ];
    survivors[0].gender = 'MASCULINO' as any;
    survivors[1].gender = 'FEMENINO' as any;
    const created = await this.prisma.settlement.create({
      data: {
        name: data.name,
        ownerId: data.ownerId,
        tier: (data.tier as any) ?? 'REFUGIO',
        lvyBalance: qty(500),
        maxLvyStorage: qty(5000),
        gameTime: 0,
        currentDay: 1, currentMonth: 3, currentYear: 1000,
        weather: 'DESPEJADO' as any, season: 'PRIMAVERA' as any,
        landFertility: 1.0, pollutionLevel: 0, diseaseRisk: 0.02,
        foodPriority: 60, defensePriority: 20, productionPriority: 20,
        survivors: survivors as any,
        buildings: [
          { id: randomUUID(), type: 'ALMACEN' as any, category: 'ALMACENAMIENTO' as any, level: 1, isOperating: true, productionRate: 1, workSlots: [], maxWorkers: 2, currentHP: 100, maxHP: 100, lastMaintenance: new Date() },
          { id: randomUUID(), type: 'GRANJA' as any, category: 'PRODUCCION' as any, level: 1, isOperating: true, productionRate: 1, workSlots: [{ survivorId: survivors[0].id, assignedAt: new Date(), efficiency: 1 }], maxWorkers: 3, currentRecipe: { inputs: [{ resourceType: 'AGUA' as any, quantity: qty(10) }], outputs: [{ resourceType: 'TRIGO' as any, quantity: qty(20) }], cycleDuration: 100, currentProgress: 0 }, currentHP: 100, maxHP: 100, lastMaintenance: new Date() },
        ] as any,
        inventory: [
          { id: randomUUID(), type: 'MADERA' as any, quantity: qty(400), weight: 0.5 },
          { id: randomUUID(), type: 'PIEDRA' as any, quantity: qty(250), weight: 1.2 },
          { id: randomUUID(), type: 'RACIONES_COMIDA' as any, quantity: qty(150), weight: 0.3 },
          { id: randomUUID(), type: 'AGUA' as any, quantity: qty(800), weight: 1 },
        ] as any,
        historyLog: [{ id: randomUUID(), gameYear: 1000, gameMonth: 3, gameDay: 1, gameTick: 0, type: 'SOCIAL' as any, eventText: `Fundación de ${data.name}`, metadata: {}, timestamp: new Date() }] as any,
      },
    });
    return new SettlementDomain(created);
  }

  async save(domainModel: SettlementDomain): Promise<void> {
    const snapshot = domainModel.toPersistenceSnapshot();

    SettlementValidator.validateOrphanRefs(snapshot);
    SettlementValidator.validateBsonSize(snapshot);

    await this.prisma.settlement.update({
      where: { id: domainModel.id },
      data: {
        gameTime: snapshot.gameTime,
        currentDay: snapshot.currentDay,
        currentMonth: snapshot.currentMonth,
        currentYear: snapshot.currentYear,
        season: snapshot.season,
        weather: snapshot.weather,
        lvyBalance: snapshot.lvyBalance,
        maxLvyStorage: snapshot.maxLvyStorage,
        landFertility: snapshot.landFertility,
        pollutionLevel: snapshot.pollutionLevel,
        diseaseRisk: snapshot.diseaseRisk,
        foodPriority: snapshot.foodPriority,
        defensePriority: snapshot.defensePriority,
        productionPriority: snapshot.productionPriority,
        survivors: snapshot.survivors as any,
        buildings: snapshot.buildings as any,
        inventory: snapshot.inventory as any,
        historyLog: snapshot.historyLog as any,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.settlement.delete({ where: { id } });
  }
}
