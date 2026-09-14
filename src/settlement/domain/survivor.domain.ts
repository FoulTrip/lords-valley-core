import {
  Survivor,
  Attributes,
  Needs,
  Profession,
  TaskStatus,
  JobRole,
  Resource,
  ResourceType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  catalogForResourceType,
  getConsumableEffect,
  resourceTypeForCatalog,
} from '../../player/item-catalog';

/** Los NPC comen/beben automáticamente a partir de este nivel de necesidad. */
export const NPC_AUTO_EAT_THRESHOLD = 20;

const ONE_UNIT = (BigInt(1) * BigInt(10) ** BigInt(18)).toString();

export class SurvivorDomain {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Survivor['gender'];
  readonly age: number;

  private loyalty: number;
  private isLoyalAbsolute: boolean;
  private needs: Needs;
  private lvyBalance: bigint;
  private currentTask: TaskStatus;
  private assignedJob: JobRole;
  private positionX: number;
  private positionY: number;
  private superiorId: string | null;
  private attributes: Attributes;
  private professions: Profession[];
  private personalInventory: Resource[];

  constructor(private readonly raw: Survivor) {
    this.id = raw.id;
    this.firstName = raw.firstName;
    this.lastName = raw.lastName;
    this.gender = raw.gender;
    this.age = raw.age;
    this.loyalty = raw.loyalty;
    this.isLoyalAbsolute = raw.isLoyalAbsolute;
    this.needs = { ...raw.needs };
    this.lvyBalance = BigInt(raw.lvyBalance);
    this.currentTask = raw.currentTask;
    this.assignedJob = raw.assignedJob;
    this.positionX = raw.positionX;
    this.positionY = raw.positionY;
    this.superiorId = raw.superiorId ?? null;
    this.attributes = { ...raw.attributes };
    this.professions = [...raw.professions];
    this.personalInventory = Array.isArray((raw as any).inventory)
      ? (raw as any).inventory.map((r: any) => ({ ...r }))
      : [];
  }

  getLoyalty(): number {
    return this.loyalty;
  }

  getIsLoyalAbsolute(): boolean {
    return this.isLoyalAbsolute;
  }

  getNeeds(): Needs {
    return { ...this.needs };
  }

  getPersonalInventory(): Resource[] {
    return this.personalInventory.map((r) => ({ ...r }));
  }

  private personalTotal(type: ResourceType): bigint {
    let acc = 0n;
    for (const r of this.personalInventory) {
      if ((r.type as string) === (type as string)) {
        try {
          acc += BigInt((r as any).quantity ?? '0');
        } catch {
          // ignora cantidades corruptas
        }
      }
    }
    return acc;
  }

  private consumePersonal(type: ResourceType, amountStr: string): boolean {
    let need: bigint;
    try {
      need = BigInt(amountStr);
    } catch {
      return false;
    }
    if (need <= 0n || this.personalTotal(type) < need) return false;
    let remaining = need;
    for (const r of this.personalInventory) {
      if (remaining <= 0n) break;
      if ((r.type as string) !== (type as string)) continue;
      let have = 0n;
      try {
        have = BigInt((r as any).quantity ?? '0');
      } catch {
        continue;
      }
      const take = have < remaining ? have : remaining;
      (r as any).quantity = (have - take).toString();
      remaining -= take;
    }
    this.personalInventory = this.personalInventory.filter((r) => {
      try {
        return BigInt((r as any).quantity ?? '0') > 0n;
      } catch {
        return false;
      }
    });
    return remaining <= 0n;
  }

  private addPersonal(type: ResourceType, amountStr: string): void {
    const existing = this.personalInventory.find((r) => (r.type as string) === (type as string));
    if (existing) {
      try {
        (existing as any).quantity = (BigInt((existing as any).quantity) + BigInt(amountStr)).toString();
        return;
      } catch {
        // cae a crear nuevo
      }
    }
    this.personalInventory.push({ id: randomUUID(), type, quantity: amountStr, weight: 0 } as any);
  }

  /**
   * Auto-consumo heredado de CONSUMABLE_EFFECTS (player/item-catalog):
   * si tiene hambre/sed (>= umbral), consume 1 unidad del PRIMER item de su
   * inventario personal cuyo efecto cubra esa necesidad y aplica hunger/thirst
   * (+ envase si emptiesTo). Los items nuevos lo heredan sin más cambios.
   * Retorna lo que consumió (para logs/eventos).
   */
  tryAutoConsumePersonal(): { ate: boolean; drank: boolean } {
    let ate = false;
    let drank = false;
    try {
      if (this.needs.hunger >= NPC_AUTO_EAT_THRESHOLD) ate = this.consumeFirstWithEffect('hunger');
    } catch {
      // nunca romper el tick por un inventario corrupto
    }
    try {
      if (this.needs.thirst >= NPC_AUTO_EAT_THRESHOLD) drank = this.consumeFirstWithEffect('thirst');
    } catch {
      // nunca romper el tick por un inventario corrupto
    }
    return { ate, drank };
  }

  private consumeFirstWithEffect(kind: 'hunger' | 'thirst'): boolean {
    for (const r of this.personalInventory) {
      const catalog = catalogForResourceType((r as any).type);
      if (!catalog) continue;
      const found = getConsumableEffect(catalog);
      const amount = kind === 'hunger' ? found?.effect.hunger : found?.effect.thirst;
      if (!found || found.effect.notUsable || !amount || amount <= 0) continue;
      if (!this.consumePersonal((r as any).type as ResourceType, ONE_UNIT)) continue;
      if (kind === 'hunger') this.consumeFood(amount);
      else this.consumeWater(amount);
      if (found.effect.emptiesTo) {
        const emptyType = resourceTypeForCatalog(found.effect.emptiesTo);
        if (emptyType) this.addPersonal(emptyType as ResourceType, ONE_UNIT);
      }
      return true;
    }
    return false;
  }

  getLvyBalance(): bigint {
    return this.lvyBalance;
  }

  applyMetabolismTick(isWinter: boolean): {
    loyaltyChanged: boolean;
    newLoyalty: number;
    isLoyalAbsolute: boolean;
  } {
    // Saciedad 5h: SettlementDomain llama a este tick 1 vez cada 90 ticks de
    // simulación (90 x 2s = 180s = 1 punto). 100 puntos = 5h de 0->100.
    // Invierno: el hambre aprieta el doble; la sed avanza igual siempre.
    const hungerIncrement = isWinter ? 2 : 1;
    this.needs.hunger = Math.min(100, this.needs.hunger + hungerIncrement);

    const thirstIncrement = 1;
    this.needs.thirst = Math.min(100, this.needs.thirst + thirstIncrement);

    this.needs.fatigue = Math.min(100, this.needs.fatigue + 1);

    if (this.needs.hunger >= 90 || this.needs.thirst >= 90) {
      this.needs.health = Math.max(0, this.needs.health - 2);
    }

    let loyaltyChanged = false;
    if (this.needs.hunger >= 80 && !this.isLoyalAbsolute) {
      const prev = this.loyalty;
      this.loyalty = Math.max(0, this.loyalty - 2);
      loyaltyChanged = prev !== this.loyalty;
    }

    if (this.needs.health <= 20 && !this.isLoyalAbsolute) {
      const prev = this.loyalty;
      this.loyalty = Math.max(0, this.loyalty - 1);
      loyaltyChanged = loyaltyChanged || prev !== this.loyalty;
    }

    if (this.loyalty === 100) {
      this.isLoyalAbsolute = true;
    }

    return {
      loyaltyChanged,
      newLoyalty: this.loyalty,
      isLoyalAbsolute: this.isLoyalAbsolute,
    };
  }

  applySanityTick(pollutionLevel: number, diseaseRisk: number): void {
    if (pollutionLevel > 0.5 || diseaseRisk > 0.5) {
      this.needs.sanity = Math.max(0, this.needs.sanity - 1);
      this.needs.safety = Math.max(0, this.needs.safety - 1);
    }
  }

  consumeFood(amount = 20): void {
    this.needs.hunger = Math.max(0, this.needs.hunger - amount);
    if (this.needs.health < 100 && this.needs.health > 0) this.needs.health = Math.min(100, this.needs.health + 2);
    else if (this.needs.health === 0) this.needs.health = Math.min(100, this.needs.health + 1);
    this.needs.fatigue = Math.max(0, this.needs.fatigue - 5);
  }

  consumeWater(amount = 20): void {
    this.needs.thirst = Math.max(0, this.needs.thirst - amount);
    if (this.needs.health < 100 && this.needs.health > 0) this.needs.health = Math.min(100, this.needs.health + 2);
    else if (this.needs.health === 0) this.needs.health = Math.min(100, this.needs.health + 1);
  }

  rest(): void {
    this.needs.fatigue = Math.max(0, this.needs.fatigue - 10);
    if (this.needs.health < 100) this.needs.health = Math.min(100, this.needs.health + 1);
  }

  rewardLvy(amount: bigint): void {
    if (amount < 0n) throw new Error('reward amount must be positive');
    this.lvyBalance += amount;
  }

  spendLvy(amount: bigint): boolean {
    if (amount < 0n) throw new Error('spend amount must be positive');
    if (this.lvyBalance < amount) return false;
    this.lvyBalance -= amount;
    return true;
  }

  addExperience(professionType: string, amount: string): void {
    const prof = this.professions.find((p) => p.type === professionType);
    if (!prof) return;
    const current = BigInt(prof.experience);
    const added = BigInt(amount);
    prof.experience = (current + added).toString();
  }

  toPersistence(rawSurvivor: Survivor): Survivor {
    return {
      ...rawSurvivor,
      loyalty: this.loyalty,
      isLoyalAbsolute: this.isLoyalAbsolute,
      lvyBalance: this.lvyBalance.toString(),
      currentTask: this.currentTask,
      assignedJob: this.assignedJob,
      positionX: this.positionX,
      positionY: this.positionY,
      superiorId: this.superiorId,
      needs: { ...this.needs },
      attributes: { ...this.attributes },
      professions: [...this.professions],
      inventory: [...this.personalInventory] as any,
    };
  }
}
