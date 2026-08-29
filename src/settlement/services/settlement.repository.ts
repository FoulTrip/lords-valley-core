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
        survivorCount: 3,
        buildingCount: 2,
        woodTotal: qty(400),
        stoneTotal: qty(250),
        foodTotal: qty(150),
        waterTotal: qty(800),
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
        // HistoryLog: crear entrada inicial en SettlementHistory y mantener una copia embebida
        historyLog: [{ id: randomUUID(), gameYear: 1000, gameMonth: 3, gameDay: 1, gameTick: 0, type: 'SOCIAL' as any, eventText: `Fundación de ${data.name}`, metadata: {}, timestamp: new Date() }] as any,
      },
    });
    return new SettlementDomain(created);
  }

  async save(domainModel: SettlementDomain): Promise<void> {
    const snapshot = domainModel.toPersistenceSnapshot();

    SettlementValidator.validateOrphanRefs(snapshot);
    SettlementValidator.validateBsonSize(snapshot);

    // Separar cambios de estado vs. nuevos eventos de historia
    const { historyLog, ...settlementData } = snapshot;

    // Actualizar solo los campos que cambiaron en Settlement
    await this.prisma.settlement.update({
      where: { id: domainModel.id },
      data: {
        gameTime: settlementData.gameTime,
        currentDay: settlementData.currentDay,
        currentMonth: settlementData.currentMonth,
        currentYear: settlementData.currentYear,
        season: settlementData.season,
        weather: settlementData.weather,
        lvyBalance: settlementData.lvyBalance,
        maxLvyStorage: settlementData.maxLvyStorage,
        landFertility: settlementData.landFertility,
        pollutionLevel: settlementData.pollutionLevel,
        diseaseRisk: settlementData.diseaseRisk,
        foodPriority: settlementData.foodPriority,
        defensePriority: settlementData.defensePriority,
        productionPriority: settlementData.productionPriority,
        // Actualizar contadores agregados
        woodTotal: settlementData.woodTotal,
        stoneTotal: settlementData.stoneTotal,
        foodTotal: settlementData.foodTotal,
        waterTotal: settlementData.waterTotal,
        survivorCount: settlementData.survivorCount,
        buildingCount: settlementData.buildingCount,
        // Agregar nueva entrada de historyLog a la colección separada
        // Mantener los últimos N entradas embebidas para acceso rápido
        historyLog: snapshot.historyLog as any,
      },
    });

    // También guardar la entrada de historia en la colección separada
    // Solo guardamos si hay eventos nuevos que no estaban antes
    if (historyLog && historyLog.length > 0) {
      // Filtrar solo el evento más reciente para guardar en colección separada
      const recentEvents = historyLog.filter(
        (log, index) => index >= (snapshot.historyLog?.length || 0)
      );

      if (recentEvents.length > 0) {
        for (const event of recentEvents) {
          await this.prisma.settlementHistory.create({
            data: {
              settlementId: domainModel.id,
              gameYear: event.gameYear,
              gameMonth: event.gameMonth,
              gameDay: event.gameDay,
              gameTick: event.gameTick,
              type: event.type,
              eventText: event.eventText,
              metadata: event.metadata,
              timestamp: event.timestamp,
            },
          });
        }
      }
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.settlement.delete({ where: { id } });
  }
}