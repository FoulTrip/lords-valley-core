import {
  Settlement,
  Season,
  SettlementTier,
  Weather,
  ResourceType,
  Resource,
} from '@prisma/client';
import { SurvivorDomain } from './survivor.domain';
import { DomainEvent } from '../types/settlement.types';

export class SettlementDomain {
  readonly id: string;
  private tier: SettlementTier;
  private lvyBalance: bigint;
  private maxLvyStorage: bigint;
  private season: Season;
  private weather: Weather;
  private gameTime: number;
  private currentDay: number;
  private currentMonth: number;
  private currentYear: number;
  private landFertility: number;
  private pollutionLevel: number;
  private diseaseRisk: number;
  private foodPriority: number;
  private defensePriority: number;
  private productionPriority: number;

  private survivors: SurvivorDomain[];
  private inventory: Resource[];
  private eventsTracked: DomainEvent[] = [];

  constructor(private readonly rawData: Settlement) {
    this.id = rawData.id;
    this.tier = rawData.tier;
    this.lvyBalance = BigInt(rawData.lvyBalance);
    this.maxLvyStorage = BigInt(rawData.maxLvyStorage);
    this.season = rawData.season;
    this.weather = rawData.weather;
    this.gameTime = rawData.gameTime;
    this.currentDay = rawData.currentDay;
    this.currentMonth = rawData.currentMonth;
    this.currentYear = rawData.currentYear;
    this.landFertility = rawData.landFertility;
    this.pollutionLevel = rawData.pollutionLevel;
    this.diseaseRisk = rawData.diseaseRisk;
    this.foodPriority = rawData.foodPriority;
    this.defensePriority = rawData.defensePriority;
    this.productionPriority = rawData.productionPriority;
    this.survivors = rawData.survivors.map((s) => new SurvivorDomain(s));
    this.inventory = (rawData.inventory as Resource[]).map((r) => ({ ...r }));
  }

  getTier(): SettlementTier {
    return this.tier;
  }

  getLvyBalance(): bigint {
    return this.lvyBalance;
  }

  getSurvivors(): SurvivorDomain[] {
    return [...this.survivors];
  }

  getGameTime(): number {
    return this.gameTime;
  }

  getSeason(): Season {
    return this.season;
  }

  addLvy(amount: bigint): void {
    if (amount < 0n) throw new Error('amount must be positive');
    const next = this.lvyBalance + amount;
    if (this.maxLvyStorage > 0n && next > this.maxLvyStorage) {
      this.lvyBalance = this.maxLvyStorage;
    } else {
      this.lvyBalance = next;
    }
  }

  spendLvy(amount: bigint): boolean {
    if (amount < 0n) throw new Error('amount must be positive');
    if (this.lvyBalance < amount) return false;
    this.lvyBalance -= amount;
    return true;
  }

  private consumeFromInventory(type: ResourceType, amountStr: string): boolean {
    const item = this.inventory.find((r) => r.type === type);
    if (!item) return false;
    try {
      const have = BigInt(item.quantity);
      const need = BigInt(amountStr);
      if (have < need) return false;
      item.quantity = (have - need).toString();
      return true;
    } catch {
      return false;
    }
  }

  private tryFeedSurvivor(survivor: SurvivorDomain): void {
    const needs = survivor.getNeeds();
    const oneUnit = (BigInt(1) * BigInt(10) ** BigInt(18)).toString();
    if (needs.hunger > 40) {
      if (this.consumeFromInventory(ResourceType.RACIONES_COMIDA, oneUnit)) {
        survivor.consumeFood(30);
      } else if (this.consumeFromInventory(ResourceType.CARNE, oneUnit) || this.consumeFromInventory(ResourceType.TRIGO, oneUnit) || this.consumeFromInventory(ResourceType.VERDURAS, oneUnit)) {
        survivor.consumeFood(25);
      }
    }
    if (needs.thirst > 40) {
      if (this.consumeFromInventory(ResourceType.AGUA, oneUnit)) {
        survivor.consumeWater(30);
      }
    }
    if (needs.fatigue > 70) {
      survivor.rest();
    }
  }

  executeTick(): void {
    this.gameTime += 1;

    const isWinter = this.season === Season.INVIERNO;

    for (const survivor of this.survivors) {
      this.tryFeedSurvivor(survivor);
      const result = survivor.applyMetabolismTick(isWinter);
      survivor.applySanityTick(this.pollutionLevel, this.diseaseRisk);

      if (result.loyaltyChanged) {
        this.eventsTracked.push({
          type: 'SURVIVOR_LOYALTY_CHANGED',
          payload: {
            settlementId: this.id,
            survivorId: survivor.id,
            loyalty: result.newLoyalty,
            isLoyalAbsolute: result.isLoyalAbsolute,
          },
        });
      }
    }

    this.advanceCalendarTick();
  }

  private advanceCalendarTick(): void {
    // Simple tick: each gameTime increment could map to sub-day.
    // For MVP: every 100 ticks = 1 day
    if (this.gameTime % 100 === 0) {
      this.currentDay += 1;
      if (this.currentDay > 30) {
        this.currentDay = 1;
        this.currentMonth += 1;
        if (this.currentMonth > 12) {
          this.currentMonth = 1;
          this.currentYear += 1;
        }
        this.rotateSeason();
      }
    }
  }

  private rotateSeason(): void {
    const seasonOrder: Season[] = [
      Season.PRIMAVERA,
      Season.VERANO,
      Season.OTOÑO,
      Season.INVIERNO,
    ];
    const idx = seasonOrder.indexOf(this.season);
    this.season = seasonOrder[(idx + 1) % seasonOrder.length];
  }

  updatePriorities(food: number, defense: number, production: number): void {
    [food, defense, production].forEach((v) => {
      if (v < 0 || v > 100) throw new Error('priority must be 0-100');
    });
    this.foodPriority = food;
    this.defensePriority = defense;
    this.productionPriority = production;
    this.eventsTracked.push({
      type: 'SETTLEMENT_PRIORITIES_CHANGED',
      payload: {
        settlementId: this.id,
        foodPriority: food,
        defensePriority: defense,
        productionPriority: production,
      },
    });
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.eventsTracked];
    this.eventsTracked = [];
    return events;
  }

  getSizeEstimateBytes(): number {
    return Buffer.byteLength(JSON.stringify(this.rawData), 'utf8');
  }

  isApproachingBsonLimit(threshold = 10_000_000): boolean {
    return this.getSizeEstimateBytes() > threshold;
  }

  toPersistenceSnapshot(): Settlement {
    return {
      ...this.rawData,
      gameTime: this.gameTime,
      currentDay: this.currentDay,
      currentMonth: this.currentMonth,
      currentYear: this.currentYear,
      season: this.season,
      weather: this.weather,
      lvyBalance: this.lvyBalance.toString(),
      maxLvyStorage: this.maxLvyStorage.toString(),
      landFertility: this.landFertility,
      pollutionLevel: this.pollutionLevel,
      diseaseRisk: this.diseaseRisk,
      foodPriority: this.foodPriority,
      defensePriority: this.defensePriority,
      productionPriority: this.productionPriority,
      survivors: this.rawData.survivors.map((rawS) => {
        const domainS = this.survivors.find((s) => s.id === rawS.id);
        return domainS ? domainS.toPersistence(rawS) : rawS;
      }),
      inventory: this.inventory as any,
    };
  }
}
