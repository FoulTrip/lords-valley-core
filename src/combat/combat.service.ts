import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BASE_ATTACK_WINDOW_MS,
  MIN_ATTACK_HITS_PER_WINDOW,
  applyQualityToEquipmentStats,
  applyQualityToWeaponStats,
  getConsumableCombat,
  getEquipmentStats,
  getWeaponStats,
  TILE_PX,
  type BleedSpec,
  type EquipmentStats,
  type TimedBuff,
  type TimedBuffKind,
  type WeaponStats,
} from '../player/item-catalog';
import {
  CombatHitResultDto,
  GhostStateDto,
  GhostDamageResultDto,
  PlayerDamageResultDto,
} from './dto/ghost.dto';

/** Daño máximo que el servidor acepta de un monto reportado sin arma */
const MAX_DAMAGE_PER_HIT = 200;

/** Daño máximo en la vía con arma validada (arma + elixir). */
const MAX_WEAPON_HIT = 500;

/** Cooldown mínimo absoluto entre golpes del mismo atacante (anti-macro). */
const MIN_HIT_COOLDOWN_MS = 150;

/** Maná máximo canónico (Poción de Maná +10). Solo el player lo usa en v0.1. */
const PLAYER_MAX_MANA = 100;

/** Distancia máxima aceptable entre atacante y ghost (px en mundo iso) */
const MAX_ATTACK_DISTANCE = 150;

/** Distancia máxima aceptable en reportes melee genéricos (posiciones del cliente) */
const MAX_MELEE_DISTANCE = 250;

/** Cooldown mínimo entre ataques del mismo atacante al mismo ghost (ms) */
const ATTACK_COOLDOWN_MS = 800;

/** Daño máximo que el servidor acepta de un monto reportado sin arma (anti-cheat) */

/**
 * Dimensiones del mundo iso del cliente (WORLD_TILES=192, rombo 64x32).
 * El servidor acota aquí las bases de spawn sugeridas por el cliente.
 */
const ISO_WORLD_W = 12288;
const ISO_WORLD_H = 6144;

/**
 * Estadísticas canónicas de combate. El servidor es la única autoridad:
 * el cliente nunca decide daño, HP máximo ni muerte.
 */
export const COMBAT_STATS = {
  survivor: { maxHp: 200, maxEnergia: 50, damage: 10, cooldownMs: 1500 },
  'dead-dragon': { maxHp: 1500, maxEnergia: 900, damage: 500, cooldownMs: 2000 },
  ghost: { maxHp: 600, maxEnergia: 100, damage: 50, cooldownMs: 1200 },
  player: { maxHp: 200, maxEnergia: 100, cooldownMs: 800 },
} as const;

export type CombatEntityKind = keyof typeof COMBAT_STATS;

/** Daño base canónico por atacante (el player reporta monto, acotado a 200). */
const ATTACKER_DAMAGE: Partial<Record<CombatEntityKind, number>> = {
  survivor: COMBAT_STATS.survivor.damage,
  'dead-dragon': COMBAT_STATS['dead-dragon'].damage,
  ghost: COMBAT_STATS.ghost.damage,
};

/**
 * Estadísticas canónicas de un Ghost según el servidor.
 * Estos valores NO pueden ser modificados por el cliente.
 */
const GHOST_CANON_MAX_HP = COMBAT_STATS.ghost.maxHp;
const GHOST_CANON_MAX_ENERGIA = COMBAT_STATS.ghost.maxEnergia;
const GHOST_CANON_DAMAGE_TO_PLAYER = COMBAT_STATS.ghost.damage;
const GHOST_CANON_ATTACK_COOLDOWN_MS = COMBAT_STATS.ghost.cooldownMs;

interface GhostRecord {
  id: string;
  settlementId: string;
  hp: number;
  maxHp: number;
  energia: number;
  maxEnergia: number;
  positionX: number;
  positionY: number;
  isDead: boolean;
  spawnedAt: number;
  dots: ActiveDot[];
  buffs: EntityBuff[];
}

interface AttackRecord {
  lastAttackTime: number;
}

/**
 * Daño en el tiempo activo sobre una entidad.
 * - hemorragia: perTick = daño TOTAL acumulado (se suma por acumulación, la
 *   duración se reinicia, no se acumula). stacks con tope maxStacks.
 * - quemadura/frio: perTick = daño total / duración (reparto).
 */
export interface ActiveDot {
  kind: 'hemorragia' | 'quemadura' | 'frio';
  perTick: number;
  stacks: number;
  perStack: number;
  maxStacks: number;
  expiresAt: number;
}

/** Buff/debuff activo sobre una entidad (resistencias, inmunidades, HoT, slows). */
export interface EntityBuff {
  kind: TimedBuffKind;
  value: number;
  expiresAt: number;
}

/**
 * Loadout de combate de un luchador (el servidor lo carga del dueño del
 * settlement para el player; para survivors el cliente reporta el nombre del
 * arma y aquí se valida contra el catálogo — nunca se aceptan números).
 * Incluye todos los slots de equipo persistidos (armadura, casco, botas,
 * guantes, escudo, collar, anillo, capa) con su calidad, igual que el arma.
 */
export interface FighterLoadout {
  weapon?: string | null;
  armor?: string | null;
  weaponCalidad?: string | null;
  armorCalidad?: string | null;
  helmet?: string | null;
  helmetCalidad?: string | null;
  boots?: string | null;
  bootsCalidad?: string | null;
  gloves?: string | null;
  glovesCalidad?: string | null;
  shield?: string | null;
  shieldCalidad?: string | null;
  necklace?: string | null;
  necklaceCalidad?: string | null;
  ring?: string | null;
  ringCalidad?: string | null;
  cape?: string | null;
  capeCalidad?: string | null;
  damageBonus?: number;
  buffs?: TimedBuff[];
}

/** Evento del tick de efectos (1s): el gateway lo difunde al room. */
export interface DotTickEvent {
  targetId: string;
  targetKind: 'ghost' | CombatEntityKind;
  settlementId: string;
  hp: number;
  maxHp: number;
  dead: boolean;
  diedThisTick: boolean;
  /** Ralentización de movimiento vigente (el cliente frena la persecución). */
  slowMovePct: number;
}

@Injectable()
export class CombatService {
  private readonly logger = new Logger(CombatService.name);

  /**
   * Registro en memoria de ghosts activos por settlementId.
   * En producción esto debería persistirse en Redis o MongoDB.
   * Para v0.1 en memoria es suficiente (se resetea al reiniciar el servidor).
   */
  private readonly ghosts = new Map<string, GhostRecord>();

  /**
   * Cooldowns de ataque: key = `${attackerId}:${ghostId}`
   * Previene spam de daño desde el cliente.
   */
  private readonly attackCooldowns = new Map<string, AttackRecord>();

  /**
   * Cooldowns de ataque del ghost al jugador: key = `${ghostId}:${targetId}`
   */
  private readonly ghostAttackCooldowns = new Map<string, AttackRecord>();

  /**
   * Registro autoritativo de HP para entidades de combate genéricas
   * (player, survivor, dead-dragon). Los ghosts viven en su propio mapa
   * con posición; aquí solo importa el HP para decidir daño y muerte.
   * Registro perezoso: la primera vez que una entidad es objetivo se crea
   * con HP lleno canónico — el cliente nunca fija HP máximo.
   */
  private readonly entities = new Map<
    string,
    {
      kind: CombatEntityKind;
      hp: number;
      maxHp: number;
      mana: number;
      maxMana: number;
      damageBonus: number;
      dots: ActiveDot[];
      buffs: EntityBuff[];
      /** Resistencias de equipo (capa) vigentes, sincronizadas del loadout. */
      equipmentResists: { fire: number; cold: number };
      settlementId: string;
      dead: boolean;
    }
  >();

  /** Cooldowns de combat:hit: key = `${attackerId}:${targetId}` */
  private readonly hitCooldowns = new Map<string, AttackRecord>();

  private getOrRegisterEntity(
    id: string,
    kind: CombatEntityKind,
    settlementId: string,
  ): {
    kind: CombatEntityKind;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    damageBonus: number;
    dots: ActiveDot[];
    buffs: EntityBuff[];
    equipmentResists: { fire: number; cold: number };
    settlementId: string;
    dead: boolean;
  } {
    let rec = this.entities.get(id);
    if (!rec) {
      const maxHp =
        kind === 'player'
          ? COMBAT_STATS.player.maxHp
          : kind === 'survivor'
            ? COMBAT_STATS.survivor.maxHp
            : COMBAT_STATS['dead-dragon'].maxHp;
      const maxMana =
        kind === 'player'
          ? PLAYER_MAX_MANA
          : kind === 'survivor'
            ? COMBAT_STATS.survivor.maxEnergia
            : COMBAT_STATS['dead-dragon'].maxEnergia;
      rec = { kind, hp: maxHp, maxHp, mana: maxMana, maxMana, damageBonus: 0, dots: [], buffs: [], equipmentResists: { fire: 0, cold: 0 }, settlementId, dead: false };
      this.entities.set(id, rec);
    }
    return rec;
  }

  // ── Helpers de stats/efectos ──────────────────────────────────────

  private pruneExpired(record: { dots: ActiveDot[]; buffs: EntityBuff[] }, now: number): void {
    record.dots = record.dots.filter((d) => d.expiresAt > now && d.perTick > 0);
    record.buffs = record.buffs.filter((b) => b.expiresAt > now);
  }

  private hasBuff(record: { buffs: EntityBuff[] }, kind: TimedBuffKind, now: number): boolean {
    return record.buffs.some((b) => b.kind === kind && b.expiresAt > now);
  }

  private buffValue(record: { buffs: EntityBuff[] }, kind: TimedBuffKind, now: number): number {
    let v = 0;
    for (const b of record.buffs) if (b.kind === kind && b.expiresAt > now) v += b.value;
    return v;
  }

  /**
   * Cadencia efectiva de un atacante con arma opcional.
   * Sin arma: cooldown canónico de la kind. Con arma: la ventana de 3s se
   * reparte en 1 + bonus golpes (suelo 1 golpe/6s si bonus < -3), con la
   * fracción de Guantes como multiplicador, y suelo anti-macro de 150ms.
   */
  private attackIntervalMs(
    baseMs: number,
    weapon: (WeaponStats & { nombre: string }) | null,
    attackSpeedPct = 0,
  ): number {
    if (!weapon) return baseMs;
    const bonus = weapon.attackSpeed;
    if (bonus < -3) return Math.round(BASE_ATTACK_WINDOW_MS / MIN_ATTACK_HITS_PER_WINDOW);
    const hits = (1 + bonus) * (1 + attackSpeedPct);
    if (!(hits > MIN_ATTACK_HITS_PER_WINDOW)) {
      return Math.round(BASE_ATTACK_WINDOW_MS / MIN_ATTACK_HITS_PER_WINDOW);
    }
    return Math.max(MIN_HIT_COOLDOWN_MS, Math.round(BASE_ATTACK_WINDOW_MS / hits));
  }

  /** Multiplicador de cooldown por ralentización de ataque vigente (1 = normal). */
  private slowCooldownMult(record: { buffs: EntityBuff[] }, now: number): number {
    const slow = this.buffValue(record, 'attack_slow', now);
    if (slow <= 0) return 1;
    const f = 1 - Math.min(0.9, slow);
    return f > 0 ? 1 / f : 10;
  }

  private resolveWeapon(weaponName?: string | null, calidad?: string | null): (WeaponStats & { nombre: string }) | null {
    if (!weaponName) return null;
    try {
      const base = getWeaponStats(weaponName);
      if (!base) return null;
      return applyQualityToWeaponStats(base, calidad ?? 'comun');
    } catch {
      return null;
    }
  }

  private resolveArmor(armorName?: string | null, calidad?: string | null): (EquipmentStats & { nombre: string }) | null {
    if (!armorName) return null;
    try {
      const base = getEquipmentStats(armorName);
      if (!base) return null;
      return applyQualityToEquipmentStats(base, calidad ?? 'comun');
    } catch {
      return null;
    }
  }

  /**
   * Bonus de equipo combinado del loadout (misma validación contra catálogo
   * + calidad que el arma y la armadura):
   * - reducción física = armadura (pecho) + casco + escudo, con tope 90%;
   * - cadencia = guantes (attackSpeedPct, multiplica los golpes);
   * - movimiento = botas (moveSpeedPct, informativo: el cliente lo aplica);
   * - resistencias elemental = capa (fuego/frío, con tope 90%).
   * Los slots sin stats de combate (collar, anillo) se validan y
   * persisten, pero no aportan bonus por ahora.
   */
  private resolveEquipmentBonuses(loadout?: FighterLoadout): {
    damageReduction: number;
    attackSpeedPct: number;
    moveSpeedPct: number;
    fireResist: number;
    coldResist: number;
  } {
    if (!loadout) {
      return { damageReduction: 0, attackSpeedPct: 0, moveSpeedPct: 0, fireResist: 0, coldResist: 0 };
    }
    const armor = this.resolveArmor(loadout.armor, loadout.armorCalidad ?? 'comun');
    const helmet = this.resolveArmor(loadout.helmet, loadout.helmetCalidad ?? 'comun');
    const shield = this.resolveArmor(loadout.shield, loadout.shieldCalidad ?? 'comun');
    const gloves = this.resolveArmor(loadout.gloves, loadout.glovesCalidad ?? 'comun');
    const boots = this.resolveArmor(loadout.boots, loadout.bootsCalidad ?? 'comun');
    const cape = this.resolveArmor(loadout.cape, loadout.capeCalidad ?? 'comun');
    return {
      damageReduction: Math.max(0, Math.min(0.9, (armor?.damageReduction ?? 0) + (helmet?.damageReduction ?? 0) + (shield?.damageReduction ?? 0))),
      attackSpeedPct: gloves?.attackSpeedPct ?? 0,
      moveSpeedPct: boots?.moveSpeedPct ?? 0,
      fireResist: Math.max(0, Math.min(0.9, cape?.fireResist ?? 0)),
      coldResist: Math.max(0, Math.min(0.9, cape?.coldResist ?? 0)),
    };
  }

  /**
   * Bonus de daño temporal del atacante (Poción de Furia): suma los buffs
   * 'damage_boost' vigentes del loadout. A diferencia del elixir, expira.
   */
  private tempDamageBonus(loadout: FighterLoadout | undefined, now = Date.now()): number {
    if (!loadout || !Array.isArray(loadout.buffs)) return 0;
    let bonus = 0;
    for (const b of loadout.buffs) {
      if (!b || b.kind !== 'damage_boost') continue;
      if (typeof b.expiresAt !== 'number' || b.expiresAt <= now) continue;
      if (typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value <= 0) continue;
      bonus += Math.floor(b.value);
    }
    return Math.max(0, bonus);
  }

  /** True si el loadout tiene invisibilidad vigente (Poción de Invisibilidad). */
  private isInvisibleLoadout(loadout: FighterLoadout | undefined, now = Date.now()): boolean {
    if (!loadout || !Array.isArray(loadout.buffs)) return false;
    return loadout.buffs.some(
      (b) => !!b && b.kind === 'invisible' && typeof b.expiresAt === 'number' && b.expiresAt > now,
    );
  }

  /**
   * Aplica hemorragia a un registro (ghost o entidad).
   * Suma el daño al total acumulado (con tope de acumulaciones) y REINICIA
   * la duración. Retorna false si el objetivo es inmune a efectos negativos.
   */
  private applyBleed(
    record: { dots: ActiveDot[]; buffs: EntityBuff[] },
    spec: BleedSpec,
    now: number,
  ): boolean {
    if (this.hasBuff(record, 'immune_negative', now)) return false;
    let dot = record.dots.find((d) => d.kind === 'hemorragia');
    if (!dot) {
      dot = { kind: 'hemorragia', perTick: 0, stacks: 0, perStack: spec.damage, maxStacks: spec.maxStacks, expiresAt: now };
      record.dots.push(dot);
    }
    if (dot.stacks < dot.maxStacks) {
      dot.stacks += 1;
      dot.perTick += spec.damage;
    }
    dot.perStack = spec.damage;
    dot.maxStacks = spec.maxStacks;
    dot.expiresAt = now + spec.durationSec * 1000;
    return true;
  }

  /**
   * Aplica quemadura o daño de frío (reparto total/duración) + ralentización
   * opcional. Retorna false si hay inmunidad (negativa general o a quemadura).
   */
  private applyElemental(
    record: { dots: ActiveDot[]; buffs: EntityBuff[] },
    spec: { kind: 'quemadura' | 'frio'; damage: number; durationSec: number },
    slow: { attackSpeedPct: number; moveSpeedPct: number; durationSec: number } | undefined,
    now: number,
  ): boolean {
    if (this.hasBuff(record, 'immune_negative', now)) return false;
    if (spec.kind === 'quemadura' && this.hasBuff(record, 'immune_burn', now)) return false;
    const perTick = spec.damage / Math.max(1, spec.durationSec);
    let dot = record.dots.find((d) => d.kind === spec.kind);
    if (!dot) {
      dot = { kind: spec.kind, perTick: 0, stacks: 1, perStack: perTick, maxStacks: 1, expiresAt: now };
      record.dots.push(dot);
    }
    dot.perTick = perTick;
    dot.expiresAt = now + spec.durationSec * 1000;
    if (slow) {
      const until = now + slow.durationSec * 1000;
      const aMag = Math.abs(slow.attackSpeedPct);
      const mMag = Math.abs(slow.moveSpeedPct);
      if (aMag > 0) {
        record.buffs = record.buffs.filter((b) => b.kind !== 'attack_slow');
        record.buffs.push({ kind: 'attack_slow', value: aMag, expiresAt: until });
      }
      if (mMag > 0) {
        record.buffs = record.buffs.filter((b) => b.kind !== 'move_slow');
        record.buffs.push({ kind: 'move_slow', value: mMag, expiresAt: until });
      }
    }
    return true;
  }

  /**
   * Spawna 1-3 ghosts para un settlement.
   * Retorna el estado autoritativo de cada ghost creado.
   *
   * La posición final SIEMPRE la genera el servidor (dispersión alrededor de
   * la base). El cliente solo puede *sugerir* una base en coords iso del mapa
   * (mundo 12288x6144); sin base se usa el centro legacy (3072,3072).
   */
  spawnGhosts(settlementId: string, count = 1, basePosition?: { x: number; y: number }): GhostStateDto[] {
    const clamped = Math.max(1, Math.min(3, count));
    const results: GhostStateDto[] = [];

    for (let i = 0; i < clamped; i++) {
      const id = `ghost_${randomUUID()}`;

      // Posición de spawn: base sugerida (acotada al mundo iso) o centro legacy
      const cx = Number.isFinite(basePosition?.x)
        ? Math.max(0, Math.min(ISO_WORLD_W, Math.round(basePosition!.x)))
        : 3072;
      const cy = Number.isFinite(basePosition?.y)
        ? Math.max(0, Math.min(ISO_WORLD_H, Math.round(basePosition!.y)))
        : 3072;
      const angle = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 300;
      const positionX = Math.round(cx + Math.cos(angle) * radius);
      const positionY = Math.round(cy + Math.sin(angle) * radius);

      const ghost: GhostRecord = {
        id,
        settlementId,
        hp: GHOST_CANON_MAX_HP,
        maxHp: GHOST_CANON_MAX_HP,
        energia: GHOST_CANON_MAX_ENERGIA,
        maxEnergia: GHOST_CANON_MAX_ENERGIA,
        positionX,
        positionY,
        isDead: false,
        spawnedAt: Date.now(),
        dots: [],
        buffs: [],
      };

      this.ghosts.set(id, ghost);

      results.push({
        id,
        settlementId,
        hp: ghost.hp,
        maxHp: ghost.maxHp,
        energia: ghost.energia,
        maxEnergia: ghost.maxEnergia,
        positionX: ghost.positionX,
        positionY: ghost.positionY,
        isDead: false,
      });

      this.logger.log(`Ghost spawned: ${id} for settlement ${settlementId} at (${positionX}, ${positionY})`);
    }

    return results;
  }

  /**
   * Aplica daño a un ghost con validación anti-cheat.
   * Verifica: distancia del atacante (+ alcance del arma), cooldown (cadencia
   * del arma si se reporta una válida), rango de daño. Con arma válida el
   * daño lo decreta el servidor desde el catálogo y aplica su hemorragia.
   */
  applyDamageToGhost(
    ghostId: string,
    amount: number,
    attackerId: string,
    attackerX: number,
    attackerY: number,
    opts?: { weapon?: string | null; attackerLoadout?: FighterLoadout },
  ): GhostDamageResultDto {
    const ghost = this.ghosts.get(ghostId);

    if (!ghost || ghost.isDead) {
      return { ghostId, applied: false, newHp: 0, isDead: true, rejectedReason: 'ghost_not_found_or_dead' };
    }

    const weapon = this.resolveWeapon(
      opts?.attackerLoadout?.weapon ?? opts?.weapon,
      opts?.attackerLoadout?.weaponCalidad ?? 'comun',
    );
    const rangeBonusPx = (weapon?.rangeTiles ?? 0) * TILE_PX;

    // Anti-cheat: validar distancia entre atacante y ghost
    const dist = Math.hypot(attackerX - ghost.positionX, attackerY - ghost.positionY);
    if (dist > MAX_ATTACK_DISTANCE + rangeBonusPx) {
      this.logger.warn(`[AntiCheat] Ataque rechazado: ${attackerId} está a ${dist.toFixed(0)}px del ghost ${ghostId} (max: ${MAX_ATTACK_DISTANCE + rangeBonusPx}px)`);
      return { ghostId, applied: false, newHp: ghost.hp, isDead: false, rejectedReason: 'attacker_too_far' };
    }

    // Anti-cheat: cooldown de ataque (cadencia del arma si hay;
    // los Guantes aceleran la cadencia como multiplicador, igual que en servidor).
    const cooldownKey = `${attackerId}:${ghostId}`;
    const lastAttack = this.attackCooldowns.get(cooldownKey);
    const now = Date.now();
    const attackerBonus = this.resolveEquipmentBonuses(opts?.attackerLoadout);
    const cdMs = this.attackIntervalMs(ATTACK_COOLDOWN_MS, weapon, attackerBonus.attackSpeedPct);
    if (lastAttack && now - lastAttack.lastAttackTime < cdMs * this.slowCooldownMult(ghost, now)) {
      this.logger.warn(`[AntiCheat] Cooldown no cumplido: ${attackerId} atacó ghost ${ghostId} demasiado rápido`);
      return { ghostId, applied: false, newHp: ghost.hp, isDead: false, rejectedReason: 'cooldown_not_met' };
    }

    // Daño: con arma validada lo decreta el catálogo (+ bonus de elixir
    // y furia temporal); sin arma se acota el monto reportado (diseño existente).
    const bonus = Math.max(0, Math.floor(opts?.attackerLoadout?.damageBonus ?? 0))
      + this.tempDamageBonus(opts?.attackerLoadout, now);
    const clampedAmount = weapon
      ? Math.max(0, Math.min(weapon.damage + bonus, MAX_WEAPON_HIT))
      : Math.max(0, Math.min(amount, MAX_DAMAGE_PER_HIT));

    // Aplicar daño
    ghost.hp = Math.max(0, ghost.hp - clampedAmount);
    this.attackCooldowns.set(cooldownKey, { lastAttackTime: now });
    if (weapon?.bleed && ghost.hp > 0) {
      this.applyBleed(ghost, weapon.bleed, now);
    }

    if (ghost.hp <= 0) {
      ghost.isDead = true;
      this.ghosts.delete(ghostId);
      this.logger.log(`Ghost eliminated: ${ghostId} by ${attackerId}`);
    }

    return {
      ghostId,
      applied: true,
      newHp: ghost.hp,
      isDead: ghost.isDead,
    };
  }

  /**
   * Valida y procesa el ataque de un ghost a un jugador.
   * El servidor es la única autoridad: verifica distancia, cooldown y modo de juego.
   */
  processGhostAttackPlayer(
    ghostId: string,
    targetId: string,
    ghostX: number,
    ghostY: number,
    targetX: number,
    targetY: number,
    settlementId: string,
    gameMode: string,
    godMode = false,
    defenderLoadout?: FighterLoadout,
  ): PlayerDamageResultDto {
    // En modo creativo el servidor NO confirma daño al jugador
    if (gameMode === 'creative') {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'creative_mode' };
    }

    // GodMode (POST /player/me/dev/godmode): el jugador es inmune al daño
    if (godMode === true) {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'god_mode' };
    }

    // Invisibilidad (Poción de Invisibilidad): el jugador es indetectable,
    // los enemigos no pueden fijarlo como objetivo ni dañarlo.
    if (this.isInvisibleLoadout(defenderLoadout)) {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'invisible' };
    }

    const ghost = this.ghosts.get(ghostId);
    if (!ghost || ghost.isDead) {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'ghost_not_found_or_dead' };
    }

    // HP autoritativo del jugador: si ya murió, se rechaza hasta que reaparezca
    const playerRec = this.getOrRegisterEntity(targetId, 'player', settlementId);
    if (playerRec.dead || playerRec.hp <= 0) {
      return {
        applied: false, amount: 0, targetId, settlementId,
        rejectedReason: 'target_dead', targetHp: 0, targetMaxHp: playerRec.maxHp, isDead: true,
      };
    }

    // Validar distancia ghost → target
    const dist = Math.hypot(ghostX - targetX, ghostY - targetY);
    if (dist > MAX_ATTACK_DISTANCE) {
      this.logger.warn(`[AntiCheat] Ghost ${ghostId} reportó ataque pero está a ${dist.toFixed(0)}px del jugador`);
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'ghost_too_far' };
    }

    // Cooldown del ghost
    const cooldownKey = `${ghostId}:${targetId}`;
    const lastAttack = this.ghostAttackCooldowns.get(cooldownKey);
    const now = Date.now();
    if (lastAttack && now - lastAttack.lastAttackTime < GHOST_CANON_ATTACK_COOLDOWN_MS) {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'cooldown_not_met' };
    }

    // Consumir energía del ghost
    ghost.energia = Math.max(0, ghost.energia - 5);
    this.ghostAttackCooldowns.set(cooldownKey, { lastAttackTime: now });

    // Sincroniza buffs persistidos del defensor (tónico/ungüento) al registro
    this.syncLoadoutBuffs(playerRec, defenderLoadout, now);

    // Reducción de daño por equipo equipado (Cota de Malla 10% + Casco 5%, escalados por calidad)
    const defenderBonus = this.resolveEquipmentBonuses(defenderLoadout);
    const dr = defenderBonus.damageReduction;
    const finalDamage = Math.max(0, GHOST_CANON_DAMAGE_TO_PLAYER * (1 - dr));

    // Aplicar daño al HP autoritativo del jugador
    playerRec.hp = Math.max(0, playerRec.hp - finalDamage);
    if (playerRec.hp <= 0) playerRec.dead = true;

    this.logger.debug(`Ghost ${ghostId} attacked ${targetId} for ${finalDamage} dmg`);

    return {
      applied: true,
      amount: finalDamage,
      targetId,
      settlementId,
      targetHp: playerRec.hp,
      targetMaxHp: playerRec.maxHp,
      isDead: playerRec.dead,
    };
  }

  /**
   * Golpe genérico validado por el servidor (player/survivor/dead-dragon/ghost
   * contra player/survivor/dead-dragon/ghost).
   * El servidor decide daño (canónico por atacante; con arma validada decreta
   * desde el catálogo + bonus de elixir; el player sin arma reporta acotado),
   * valida distancia (+ alcance del arma) y cooldown (cadencia del arma), y
   * decreta HP y muerte. El arma del atacante aplica su hemorragia al objetivo.
   */
  applyCombatHit(input: {
    attackerId: string;
    attackerKind: string;
    targetId: string;
    targetKind: string;
    attackerX: number;
    attackerY: number;
    targetX: number;
    targetY: number;
    settlementId: string;
    amount?: number;
    weapon?: string | null;
    attackerLoadout?: FighterLoadout;
    defenderLoadout?: FighterLoadout;
  }): CombatHitResultDto {
    const attackerKind = input.attackerKind as CombatEntityKind;
    const targetKind = input.targetKind as CombatEntityKind;
    if (!COMBAT_STATS[attackerKind] || !COMBAT_STATS[targetKind]) {
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: 0, targetMaxHp: 0, isDead: true, rejectedReason: 'unknown_kind',
      };
    }

    // Arma: el servidor valida el NOMBRE contra el catálogo (nunca números).
    // El player aporta su equipo persistido vía attackerLoadout (autoridad);
    // los survivors reportan su arma equipada (se valida aquí).
    const loadoutWeapon = input.attackerLoadout?.weapon ?? input.weapon ?? null;
    const weapon = this.resolveWeapon(loadoutWeapon, input.attackerLoadout?.weaponCalidad ?? 'comun');
    // Cadencia: los Guantes aportan attackSpeedPct (multiplica los golpes),
    // igual que el bonus plano de velocidad del arma.
    const attackSpeedPct = this.resolveEquipmentBonuses(input.attackerLoadout).attackSpeedPct;
    const now = Date.now();
    // Daño: bonus permanente (elixir) + furia temporal (Poción de Furia).
    const damageBonus = Math.max(0, Math.floor(input.attackerLoadout?.damageBonus ?? 0))
      + this.tempDamageBonus(input.attackerLoadout, now);
    const rangeBonusPx = (weapon?.rangeTiles ?? 0) * TILE_PX;
    const cdMs = this.attackIntervalMs(
      COMBAT_STATS[attackerKind].cooldownMs,
      attackerKind === 'ghost' || attackerKind === 'dead-dragon' ? null : weapon,
      attackSpeedPct,
    );

    // Objetivo ghost: vive en el mapa con posición servidora (validación fuerte)
    if (targetKind === 'ghost') {
      const ghost = this.ghosts.get(input.targetId);
      if (!ghost || ghost.isDead) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: 0, targetMaxHp: COMBAT_STATS.ghost.maxHp, isDead: true,
          rejectedReason: 'ghost_not_found_or_dead',
        };
      }
      const dist = Math.hypot(input.attackerX - ghost.positionX, input.attackerY - ghost.positionY);
      if (dist > MAX_ATTACK_DISTANCE + rangeBonusPx) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: false,
          rejectedReason: 'attacker_too_far',
        };
      }
      const cdKey = `${input.attackerId}:${input.targetId}`;
      const last = this.hitCooldowns.get(cdKey);
      if (last && now - last.lastAttackTime < cdMs * this.slowCooldownMult(ghost, now)) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: false,
          rejectedReason: 'cooldown_not_met',
        };
      }
      const damage = this.resolveDamage(attackerKind, input.amount, weapon, damageBonus);
      if (damage <= 0) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: false,
          rejectedReason: 'invalid_damage',
        };
      }
      ghost.hp = Math.max(0, ghost.hp - damage);
      this.hitCooldowns.set(cdKey, { lastAttackTime: now });
      if (weapon?.bleed && ghost.hp > 0) {
        this.applyBleed(ghost, weapon.bleed, now);
      }
      if (ghost.hp <= 0) {
        ghost.isDead = true;
        this.ghosts.delete(input.targetId);
      }
      return {
        applied: true, damage, targetId: input.targetId,
        targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: ghost.isDead,
      };
    }

    // Atacante ghost: el servidor conoce su posición (validación fuerte)
    let ax = input.attackerX;
    let ay = input.attackerY;
    if (attackerKind === 'ghost') {
      const ghost = this.ghosts.get(input.attackerId);
      if (!ghost || ghost.isDead) {
        const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
          rejectedReason: 'ghost_not_found_or_dead',
        };
      }
      ax = ghost.positionX;
      ay = ghost.positionY;
    }
    const dist = Math.hypot(ax - input.targetX, ay - input.targetY);
    if (dist > MAX_MELEE_DISTANCE + rangeBonusPx) {
      const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'attacker_too_far',
      };
    }

    const cdKey = `${input.attackerId}:${input.targetId}`;
    const last = this.hitCooldowns.get(cdKey);
    if (last && now - last.lastAttackTime < cdMs) {
      const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'cooldown_not_met',
      };
    }

    const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
    if (rec.dead || rec.hp <= 0) {
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: 0, targetMaxHp: rec.maxHp, isDead: true,
        rejectedReason: 'target_dead',
      };
    }

    // Sincroniza buffs persistidos del defensor y aplica su reducción de
    // equipo (armadura + casco + escudo, escalada por calidad).
    // Un defensor invisible (Poción de Invisibilidad) no puede ser dañado.
    this.syncLoadoutBuffs(rec, input.defenderLoadout, now);
    if (this.hasBuff(rec, 'invisible', now)) {
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'target_invisible',
      };
    }
    const dr = this.resolveEquipmentBonuses(input.defenderLoadout).damageReduction;

    const raw = this.resolveDamage(attackerKind, input.amount, weapon, damageBonus);
    if (raw <= 0) {
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'invalid_damage',
      };
    }
    const damage = Math.max(0, raw * (1 - dr));
    rec.hp = Math.max(0, rec.hp - damage);
    this.hitCooldowns.set(cdKey, { lastAttackTime: now });
    if (weapon?.bleed && rec.hp > 0) {
      this.applyBleed(rec, weapon.bleed, now);
    }
    if (rec.hp <= 0) rec.dead = true;
    return {
      applied: true, damage, targetId: input.targetId,
      targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
    };
  }

  private resolveDamage(
    attackerKind: CombatEntityKind,
    amount: number | undefined,
    weapon: (WeaponStats & { nombre: string }) | null,
    damageBonus: number,
  ): number {
    // Vía arma validada: el catálogo decreta (+ bonus de Elixir de Fuerza).
    if (weapon && (attackerKind === 'player' || attackerKind === 'survivor')) {
      return Math.max(0, Math.min(weapon.damage + damageBonus, MAX_WEAPON_HIT));
    }
    const canon = ATTACKER_DAMAGE[attackerKind];
    if (typeof canon === 'number') return canon;
    // El player sin arma reporta su monto; el servidor lo acota (diseño existente)
    return Math.max(0, Math.min(Math.floor(amount ?? 0), MAX_DAMAGE_PER_HIT));
  }

  /** Reaparece una entidad con HP lleno (respawn del player tras morir). */
  respawnEntity(
    entityId: string,
    kind: CombatEntityKind,
    settlementId: string,
  ): { entityId: string; hp: number; maxHp: number } {
    const rec = this.getOrRegisterEntity(entityId, kind, settlementId);
    rec.hp = rec.maxHp;
    rec.dead = false;
    return { entityId, hp: rec.hp, maxHp: rec.maxHp };
  }

  /**
   * Sincroniza buffs persistidos (tónico/ungüento/furia/invisibilidad), bonus
   * de elixir y resistencias de equipo (capa) al registro en memoria de una
   * entidad. Los expirados se descartan.
   */
  syncLoadoutBuffs(
    record: { buffs: EntityBuff[]; damageBonus?: number; equipmentResists?: { fire: number; cold: number } },
    loadout: FighterLoadout | undefined,
    now = Date.now(),
  ): void {
    if (!loadout) return;
    if (typeof loadout.damageBonus === 'number' && record.damageBonus !== undefined) {
      record.damageBonus = Math.max(0, Math.floor(loadout.damageBonus));
    }
    if (Array.isArray(loadout.buffs)) {
      for (const b of loadout.buffs) {
        if (!b || typeof b.expiresAt !== 'number' || b.expiresAt <= now) continue;
        if (!['resist_fire', 'resist_cold', 'immune_negative', 'immune_burn', 'hot', 'attack_slow', 'move_slow', 'damage_boost', 'invisible'].includes(b.kind)) continue;
        record.buffs = record.buffs.filter((e) => e.kind !== b.kind);
        record.buffs.push({ kind: b.kind, value: b.value, expiresAt: b.expiresAt });
      }
    }
    if (record.equipmentResists) {
      const { fireResist, coldResist } = this.resolveEquipmentBonuses(loadout);
      record.equipmentResists = { fire: fireResist, cold: coldResist };
    }
  }

  /** Cura HP (Poción de Vida, Venda, HoT). No revive muertos. */
  healEntity(
    entityId: string,
    kind: CombatEntityKind,
    settlementId: string,
    amount: number,
  ): { applied: boolean; hp: number; maxHp: number } {
    const rec = this.getOrRegisterEntity(entityId, kind, settlementId);
    if (rec.dead || rec.hp <= 0) return { applied: false, hp: 0, maxHp: rec.maxHp };
    rec.hp = Math.min(rec.maxHp, rec.hp + Math.max(0, amount));
    return { applied: true, hp: rec.hp, maxHp: rec.maxHp };
  }

  /** Restaura maná (Poción de Maná), con tope. */
  addMana(
    entityId: string,
    kind: CombatEntityKind,
    settlementId: string,
    amount: number,
  ): { applied: boolean; mana: number; maxMana: number } {
    const rec = this.getOrRegisterEntity(entityId, kind, settlementId);
    if (rec.dead) return { applied: false, mana: rec.mana, maxMana: rec.maxMana };
    rec.mana = Math.min(rec.maxMana, rec.mana + Math.max(0, amount));
    return { applied: true, mana: rec.mana, maxMana: rec.maxMana };
  }

  /**
   * Purga efectos (Venda: solo hemorragia; Antídoto: todo lo negativo).
   * Retorna cuántos efectos eliminó.
   */
  cleanseEntity(
    target: { dots: ActiveDot[]; buffs: EntityBuff[] } | null,
    mode: 'hemorragia' | 'all',
  ): number {
    if (!target) return 0;
    let removed = 0;
    if (mode === 'hemorragia') {
      const before = target.dots.length;
      target.dots = target.dots.filter((d) => d.kind !== 'hemorragia');
      removed = before - target.dots.length;
    } else {
      removed = target.dots.length;
      target.dots = [];
      const before = target.buffs.length;
      target.buffs = target.buffs.filter((b) => b.kind !== 'attack_slow' && b.kind !== 'move_slow');
      removed += before - target.buffs.length;
    }
    return removed;
  }

  /** Busca el registro de dots/buffs de un objetivo (ghost o entidad). */
  findTargetRecord(
    targetId: string,
    targetKind: string,
    settlementId: string,
  ): { dots: ActiveDot[]; buffs: EntityBuff[] } | null {
    if (targetKind === 'ghost') return this.ghosts.get(targetId) ?? null;
    if (targetKind === 'player' || targetKind === 'survivor' || targetKind === 'dead-dragon') {
      return this.getOrRegisterEntity(targetId, targetKind as CombatEntityKind, settlementId);
    }
    return null;
  }

  /**
   * Pergamino de Fuego/Frío: daño directo en el radio + DoT a los afectados.
   * Solo alcanza objetivos con posición servidora (ghosts en v0.1; el resto
   * de entidades no tiene posición registrada y queda fuera del área).
   */
  applyScrollAoe(input: {
    casterId: string;
    x: number;
    y: number;
    settlementId: string;
    scroll: 'Pergamino de Fuego' | 'Pergamino de Frío';
  }): { hits: { targetId: string; targetKind: string; damage: number; dead: boolean }[] } {
    const combat = getConsumableCombat(input.scroll);
    const aoe = combat?.aoe;
    const hits: { targetId: string; targetKind: string; damage: number; dead: boolean }[] = [];
    if (!aoe) return { hits };
    const now = Date.now();
    const radiusPx = aoe.radiusTiles * TILE_PX;
    for (const ghost of this.ghosts.values()) {
      if (ghost.settlementId !== input.settlementId || ghost.isDead) continue;
      const dist = Math.hypot(ghost.positionX - input.x, ghost.positionY - input.y);
      if (dist > radiusPx) continue;
      ghost.hp = Math.max(0, ghost.hp - aoe.damage);
      if (ghost.hp > 0) {
        this.applyElemental(ghost, aoe.dot, aoe.slow, now);
      } else {
        ghost.isDead = true;
        this.ghosts.delete(ghost.id);
      }
      hits.push({ targetId: ghost.id, targetKind: 'ghost', damage: aoe.damage, dead: ghost.isDead });
    }
    this.logger.log(`Scroll ${input.scroll} by ${input.casterId}: ${hits.length} hits`);
    return { hits };
  }

  /**
   * Tick de efectos (llamado cada 1s por el gateway): hemorragia (total
   * acumulado por tick), quemadura/frío (reparto con resistencias) y HoT.
   * Retorna eventos para difundir al room (HP sincronizado + muertes).
   */
  tickEffects(now = Date.now()): DotTickEvent[] {
    const events: DotTickEvent[] = [];
    for (const ghost of Array.from(this.ghosts.values())) {
      const changed = this.applyDotsTick(ghost, now);
      const slowMove = this.buffValue(ghost, 'move_slow', now);
      if (changed || ghost.dots.length > 0 || slowMove > 0) {
        events.push({
          targetId: ghost.id, targetKind: 'ghost', settlementId: ghost.settlementId,
          hp: Math.max(0, Math.round(ghost.hp)), maxHp: ghost.maxHp,
          dead: ghost.isDead, diedThisTick: changed && ghost.isDead, slowMovePct: slowMove,
        });
      }
      if (ghost.isDead) this.ghosts.delete(ghost.id);
    }
    for (const [id, rec] of Array.from(this.entities.entries())) {
      if (rec.dead) continue;
      const hadDots = rec.dots.length > 0 || rec.buffs.some((b) => b.kind === 'hot' && b.expiresAt > now);
      const changed = this.applyDotsTick(rec, now);
      const slowMove = this.buffValue(rec, 'move_slow', now);
      if (rec.hp <= 0) {
        rec.hp = 0;
        rec.dead = true;
        events.push({
          targetId: id, targetKind: rec.kind, settlementId: rec.settlementId,
          hp: 0, maxHp: rec.maxHp, dead: true, diedThisTick: true, slowMovePct: slowMove,
        });
      } else if (changed || hadDots || slowMove > 0) {
        events.push({
          targetId: id, targetKind: rec.kind, settlementId: rec.settlementId,
          hp: Math.max(0, Math.round(rec.hp)), maxHp: rec.maxHp,
          dead: false, diedThisTick: false, slowMovePct: slowMove,
        });
      }
    }
    return events;
  }

  /** Aplica 1 tick (1s) de dots + HoT a un registro. Retorna true si hubo cambio. */
  private applyDotsTick(record: GhostRecord | {
    kind: CombatEntityKind; hp: number; maxHp: number; dots: ActiveDot[]; buffs: EntityBuff[];
    equipmentResists?: { fire: number; cold: number };
  }, now: number): boolean {
    this.pruneExpired(record, now);
    if (record.dots.length === 0 && !record.buffs.some((b) => b.kind === 'hot')) return false;
    const equip = (record as { equipmentResists?: { fire: number; cold: number } }).equipmentResists;
    let changed = false;
    for (const dot of record.dots) {
      let dmg = dot.perTick;
      if (dot.kind === 'quemadura') {
        if (this.hasBuff(record, 'immune_burn', now)) continue;
        dmg *= 1 - Math.min(0.9, this.buffValue(record, 'resist_fire', now) + (equip?.fire ?? 0));
      } else if (dot.kind === 'frio') {
        dmg *= 1 - Math.min(0.9, this.buffValue(record, 'resist_cold', now) + (equip?.cold ?? 0));
      }
      if (dmg > 0) {
        record.hp = Math.max(0, record.hp - dmg);
        changed = true;
      }
    }
    for (const b of record.buffs) {
      if (b.kind === 'hot' && b.value > 0) {
        const max = (record as { maxHp: number }).maxHp;
        if (record.hp < max) {
          record.hp = Math.min(max, record.hp + b.value);
          changed = true;
        }
      }
    }
    if ((record as { hp: number }).hp <= 0) {
      (record as { hp: number }).hp = 0;
      if ((record as GhostRecord).isDead !== undefined) (record as GhostRecord).isDead = true;
    }
    return changed;
  }

  /** Limpia el registro de un settlement (cleanup). */
  clearSettlementEntities(settlementId: string): void {
    for (const [id, rec] of this.entities.entries()) {
      if (rec.settlementId === settlementId) this.entities.delete(id);
    }
  }

  /** Actualiza la posición del ghost en el registro del servidor */
  updateGhostPosition(ghostId: string, x: number, y: number): void {
    const ghost = this.ghosts.get(ghostId);
    if (ghost && !ghost.isDead) {
      ghost.positionX = x;
      ghost.positionY = y;
    }
  }

  /** Retorna todos los ghosts activos de un settlement */
  getActiveGhosts(settlementId: string): GhostStateDto[] {
    const result: GhostStateDto[] = [];
    for (const ghost of this.ghosts.values()) {
      if (ghost.settlementId === settlementId && !ghost.isDead) {
        result.push({
          id: ghost.id,
          settlementId: ghost.settlementId,
          hp: ghost.hp,
          maxHp: ghost.maxHp,
          energia: ghost.energia,
          maxEnergia: ghost.maxEnergia,
          positionX: ghost.positionX,
          positionY: ghost.positionY,
          isDead: ghost.isDead,
        });
      }
    }
    return result;
  }

  /** Elimina todos los ghosts de un settlement (cleanup) */
  clearSettlementGhosts(settlementId: string): void {
    for (const [id, ghost] of this.ghosts.entries()) {
      if (ghost.settlementId === settlementId) {
        this.ghosts.delete(id);
      }
    }
  }
}
