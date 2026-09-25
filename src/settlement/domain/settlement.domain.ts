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
import { BackendWarehouse, BackendWarehouseSlot, CreateWarehouseDto } from '../dto/warehouse.dto';
import { getItemWarehouseCategory } from '../../player/item-catalog';
import { randomUUID } from 'crypto';

export class SettlementDomain {
  /** Ticks de simulación (2s) por cada punto de hambre/sed. 90 x 2s = 180s = 1 punto -> 100 en 5h. */
  static readonly METABOLISM_TICKS_PER_POINT = 90;
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
  private worldSeed: string | null;
  private worldState: any;

  private survivors: SurvivorDomain[];
  private inventory: Resource[];
  private eventsTracked: DomainEvent[] = [];
  private _sizeEstimateBytes: number | null = null;
  private _sizeTickCounter = 0;
  private gameMode: string;

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
    this.worldSeed = (rawData as any).worldSeed ?? null;
    this.worldState = (rawData as any).worldState ?? null;
    this.gameMode = (rawData as any).gameMode ?? 'survival';
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
    // 1) Inventario personal primero: efecto heredado de CONSUMABLE_EFFECTS.
    //    Los NPC comen/beben automáticamente si tienen en su inventario.
    try {
      survivor.tryAutoConsumePersonal();
    } catch {
      // nunca romper el tick por un inventario corrupto
    }
    // 2) Reserva común del asentamiento (fallback con la misma saciedad del 20%).
    const needs = survivor.getNeeds();
    const oneUnit = (BigInt(1) * BigInt(10) ** BigInt(18)).toString();
    if (needs.hunger > 40) {
      if (this.consumeFromInventory(ResourceType.RACIONES_COMIDA, oneUnit)) {
        survivor.consumeFood(20);
      } else if (this.consumeFromInventory(ResourceType.PAN, oneUnit)) {
        survivor.consumeFood(20);
      } else if (this.consumeFromInventory(ResourceType.CARNE, oneUnit) || this.consumeFromInventory(ResourceType.TRIGO, oneUnit) || this.consumeFromInventory(ResourceType.VERDURAS, oneUnit)) {
        survivor.consumeFood(20);
      }
    }
    if (needs.thirst > 40) {
      if (this.consumeFromInventory(ResourceType.AGUA, oneUnit)) {
        survivor.consumeWater(20);
      } else if (this.consumeFromInventory(ResourceType.ODRE_AGUA, oneUnit)) {
        survivor.consumeWater(20);
      }
    }
    if (needs.fatigue > 70) {
      survivor.rest();
    }
  }

  executeTick(): void {
    this.gameTime += 1;
    this._sizeTickCounter += 1;

    const isWinter = this.season === Season.INVIERNO;
    // Metabolismo 5h: 1 punto cada 90 ticks (90 x 2s = 180s). 100 puntos = 5h.
    const shouldMetabolize = this.gameTime % SettlementDomain.METABOLISM_TICKS_PER_POINT === 0;

    for (const survivor of this.survivors) {
      this.tryFeedSurvivor(survivor);
      if (!shouldMetabolize) continue;
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

    if (this._sizeTickCounter >= 10) {
      this._sizeTickCounter = 0;
      this._sizeEstimateBytes = null;
    }
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

  updateWorldState(worldState: any): void {
    this.worldState = worldState;
  }

  updateWorldSeed(worldSeed: string): void {
    this.worldSeed = worldSeed;
  }

  setGameMode(mode: 'creative' | 'survival'): void {
    this.gameMode = mode;
    this.eventsTracked.push({
      type: 'SETTLEMENT_PRIORITIES_CHANGED',
      payload: { settlementId: this.id, gameMode: mode },
    });
  }

  getGameMode(): string {
    return this.gameMode;
  }

  getWarehouses(): BackendWarehouse[] {
    const ws = this.worldState || {};
    return Array.isArray(ws.warehouses) ? ws.warehouses : [];
  }

  addWarehouse(dto: CreateWarehouseDto): { ok: boolean; warehouse?: BackendWarehouse; error?: string } {
    const warehouses = this.getWarehouses();
    const chapter = dto.chapter || 1;

    // Límite por capítulo: Cap 1 = 1, Cap 2 = 1, Cap 3 = 2, Cap 4 = 5, Cap 5 y 6 = ilimitado
    let limit = 1;
    if (chapter === 1 || chapter === 2) limit = 1;
    else if (chapter === 3) limit = 2;
    else if (chapter === 4) limit = 5;
    else limit = Infinity;

    const countOfThisType = warehouses.filter(w => w.buildingId === dto.buildingId).length;
    if (countOfThisType >= limit) {
      return {
        ok: false,
        error: `Límite de almacenes alcanzado para el capítulo ${chapter} (${countOfThisType}/${limit}). Desbloquea el siguiente capítulo para aumentar el límite.`,
      };
    }

    const titles: Record<string, string> = {
      b_warehouse_minerals: 'Almacén de Minerales',
      b_warehouse_wood: 'Almacén de Madera',
      b_warehouse_food: 'Almacén de Comida',
    };

    const newWarehouse: BackendWarehouse = {
      id: `wh_${dto.warehouseType}_${randomUUID().slice(0, 8)}`,
      buildingId: dto.buildingId,
      warehouseType: dto.warehouseType,
      name: titles[dto.buildingId] || 'Almacén',
      tileX: dto.tileX,
      tileY: dto.tileY,
      width: 3,
      height: 3,
      level: 1,
      slots: new Array(100).fill(null),
      createdAt: Date.now(),
    };

    const updatedWarehouses = [...warehouses, newWarehouse];
    this.worldState = { ...(this.worldState || {}), warehouses: updatedWarehouses };

    return { ok: true, warehouse: newWarehouse };
  }

  depositToWarehouse(
    warehouseId: string,
    nombre: string,
    cantidad: number,
  ): { ok: boolean; warehouse?: BackendWarehouse; error?: string } {
    const warehouses = this.getWarehouses();
    const whIdx = warehouses.findIndex(w => w.id === warehouseId);
    if (whIdx === -1) return { ok: false, error: 'Almacén no encontrado.' };

    const warehouse = { ...warehouses[whIdx] };
    const requiredCategory = warehouse.warehouseType;
    const itemCategory = getItemWarehouseCategory(nombre);

    if (itemCategory !== requiredCategory) {
      return {
        ok: false,
        error: `El ítem "${nombre}" no pertenece a la categoría "${requiredCategory}" requerida por este almacén.`,
      };
    }

    if (cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a 0.' };

    const slots = [...warehouse.slots];
    let remainingToDeposit = cantidad;

    // 1. Llenar stacks existentes que tengan el mismo ítem y < 300
    for (let i = 0; i < 100; i++) {
      if (remainingToDeposit <= 0) break;
      const slot = slots[i];
      if (slot && slot.nombre.toLowerCase() === nombre.toLowerCase() && slot.cantidad < 300) {
        const canTake = 300 - slot.cantidad;
        const add = Math.min(canTake, remainingToDeposit);
        slots[i] = { ...slot, cantidad: slot.cantidad + add };
        remainingToDeposit -= add;
      }
    }

    // 2. Colocar en nuevas casillas vacías (hasta 300 por casilla)
    while (remainingToDeposit > 0) {
      const freeIdx = slots.findIndex(s => s === null);
      if (freeIdx === -1) {
        return {
          ok: false,
          error: `Almacén lleno: no quedan casillas disponibles (100/100 ocupadas).`,
        };
      }
      const add = Math.min(300, remainingToDeposit);
      slots[freeIdx] = {
        slotIndex: freeIdx,
        id: `slot_${randomUUID().slice(0, 6)}`,
        nombre,
        cantidad: add,
        categoria: requiredCategory,
      };
      remainingToDeposit -= add;
    }

    warehouse.slots = slots;
    warehouses[whIdx] = warehouse;
    this.worldState = { ...(this.worldState || {}), warehouses };

    return { ok: true, warehouse };
  }

  withdrawFromWarehouse(
    warehouseId: string,
    slotIndex: number,
    cantidad: number,
  ): { ok: boolean; item?: { nombre: string; cantidad: number; categoria: string }; warehouse?: BackendWarehouse; error?: string } {
    const warehouses = this.getWarehouses();
    const whIdx = warehouses.findIndex(w => w.id === warehouseId);
    if (whIdx === -1) return { ok: false, error: 'Almacén no encontrado.' };

    const warehouse = { ...warehouses[whIdx] };
    const slots = [...warehouse.slots];

    if (slotIndex < 0 || slotIndex >= 100 || !slots[slotIndex]) {
      return { ok: false, error: 'Casilla vacía o inválida.' };
    }

    const slot = slots[slotIndex]!;
    if (cantidad <= 0) return { ok: false, error: 'La cantidad debe ser mayor a 0.' };

    const withdrawQty = Math.min(slot.cantidad, cantidad);
    const remainingInSlot = slot.cantidad - withdrawQty;

    if (remainingInSlot <= 0) {
      slots[slotIndex] = null;
    } else {
      slots[slotIndex] = { ...slot, cantidad: remainingInSlot };
    }

    warehouse.slots = slots;
    warehouses[whIdx] = warehouse;
    this.worldState = { ...(this.worldState || {}), warehouses };

    return {
      ok: true,
      item: {
        nombre: slot.nombre,
        cantidad: withdrawQty,
        categoria: slot.categoria,
      },
      warehouse,
    };
  }

  /**
   * Agrega un survivor server-side al settlement y emite evento SURVIVOR_SPAWNED.
   * Los datos del survivor deben provenir del repositorio (IDs UUID, stats canónicos).
   */
  addSurvivor(survivorData: any): void {
    // Agregar al rawData para persistencia
    (this.rawData as any).survivors = [...(this.rawData as any).survivors, survivorData];
    this.survivors = (this.rawData as any).survivors.map((s: any) => new SurvivorDomain(s));
    this.eventsTracked.push({
      type: 'SURVIVOR_LOYALTY_CHANGED',
      payload: {
        settlementId: this.id,
        survivorId: survivorData.id,
        loyalty: survivorData.loyalty,
        isLoyalAbsolute: false,
        eventType: 'SURVIVOR_SPAWNED',
      },
    });
  }

  /**
   * Agrega recursos al inventario del settlement con validación de capacidad.
   * Retorna true si se aplicó, false si se rechazó (capacidad excedida, tipo inválido).
   */
  addToInventory(resourceType: ResourceType, quantityStr: string): { ok: boolean; newQuantity: string; reason?: string } {
    let qty: bigint;
    try {
      qty = BigInt(quantityStr);
    } catch {
      return { ok: false, newQuantity: '0', reason: 'invalid_quantity' };
    }

    if (qty <= 0n) return { ok: false, newQuantity: '0', reason: 'quantity_must_be_positive' };

    const existing = this.inventory.find((r) => r.type === resourceType);
    if (existing) {
      const prev = BigInt(existing.quantity);
      existing.quantity = (prev + qty).toString();
      return { ok: true, newQuantity: existing.quantity };
    } else {
      // Límite: máximo 50 tipos de recursos distintos en el inventario
      if (this.inventory.length >= 50) {
        return { ok: false, newQuantity: '0', reason: 'inventory_full' };
      }
      const { randomUUID } = require('crypto') as typeof import('crypto');
      this.inventory.push({ id: randomUUID(), type: resourceType, quantity: qty.toString(), weight: 0 } as any);
      return { ok: true, newQuantity: qty.toString() };
    }
  }

  rename(name: string): void {
    (this.rawData as any).name = name;
  }

  getWorldSeed(): string | null {
    return this.worldSeed;
  }

  getWorldState(): any {
    return this.worldState;
  }

  pullEvents(): DomainEvent[] {
    const events = [...this.eventsTracked];
    this.eventsTracked = [];
    return events;
  }

  getSizeEstimateBytes(): number {
    if (this._sizeEstimateBytes !== null) return this._sizeEstimateBytes;
    this._sizeEstimateBytes = Buffer.byteLength(JSON.stringify(this.rawData), 'utf8');
    return this._sizeEstimateBytes;
  }

  isApproachingBsonLimit(threshold = 10_000_000): boolean {
    if (this._sizeEstimateBytes === null) {
      this._sizeEstimateBytes = this.getSizeEstimateBytes();
    }
    return this._sizeEstimateBytes > threshold;
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
      worldSeed: this.worldSeed as any,
      worldState: this.worldState as any,
      gameMode: this.gameMode as any,
      survivors: this.rawData.survivors.map((rawS) => {
        const domainS = this.survivors.find((s) => s.id === rawS.id);
        return domainS ? domainS.toPersistence(rawS) : rawS;
      }),
      inventory: this.inventory as any,
    } as Settlement;
  }
}
