import {
  Survivor,
  Attributes,
  Needs,
  Profession,
  TaskStatus,
  JobRole,
} from '@prisma/client';

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

  getLvyBalance(): bigint {
    return this.lvyBalance;
  }

  applyMetabolismTick(isWinter: boolean): {
    loyaltyChanged: boolean;
    newLoyalty: number;
    isLoyalAbsolute: boolean;
  } {
    const hungerIncrement = isWinter ? 3 : 1;
    this.needs.hunger = Math.min(100, this.needs.hunger + hungerIncrement);

    const thirstIncrement = isWinter ? 1 : 2;
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

  consumeFood(amount = 30): void {
    this.needs.hunger = Math.max(0, this.needs.hunger - amount);
    if (this.needs.health < 100 && this.needs.health > 0) this.needs.health = Math.min(100, this.needs.health + 2);
    else if (this.needs.health === 0) this.needs.health = Math.min(100, this.needs.health + 1);
    this.needs.fatigue = Math.max(0, this.needs.fatigue - 5);
  }

  consumeWater(amount = 30): void {
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
    };
  }
}
