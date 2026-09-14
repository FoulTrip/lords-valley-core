import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CombatHitResultDto,
  GhostStateDto,
  GhostDamageResultDto,
  PlayerDamageResultDto,
} from './dto/ghost.dto';

/** Distancia máxima aceptable entre atacante y ghost (px en mundo iso) */
const MAX_ATTACK_DISTANCE = 150;

/** Distancia máxima aceptable en reportes melee genéricos (posiciones del cliente) */
const MAX_MELEE_DISTANCE = 250;

/** Cooldown mínimo entre ataques del mismo atacante al mismo ghost (ms) */
const ATTACK_COOLDOWN_MS = 800;

/** Daño máximo que el servidor acepta de una sola petición */
const MAX_DAMAGE_PER_HIT = 200;

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
}

interface AttackRecord {
  lastAttackTime: number;
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
    { kind: CombatEntityKind; hp: number; maxHp: number; settlementId: string; dead: boolean }
  >();

  /** Cooldowns de combat:hit: key = `${attackerId}:${targetId}` */
  private readonly hitCooldowns = new Map<string, AttackRecord>();

  private getOrRegisterEntity(
    id: string,
    kind: CombatEntityKind,
    settlementId: string,
  ): { kind: CombatEntityKind; hp: number; maxHp: number; settlementId: string; dead: boolean } {
    let rec = this.entities.get(id);
    if (!rec) {
      const maxHp =
        kind === 'player'
          ? COMBAT_STATS.player.maxHp
          : kind === 'survivor'
            ? COMBAT_STATS.survivor.maxHp
            : COMBAT_STATS['dead-dragon'].maxHp;
      rec = { kind, hp: maxHp, maxHp, settlementId, dead: false };
      this.entities.set(id, rec);
    }
    return rec;
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
   * Verifica: distancia del atacante, cooldown de ataque, rango de daño.
   */
  applyDamageToGhost(
    ghostId: string,
    amount: number,
    attackerId: string,
    attackerX: number,
    attackerY: number,
  ): GhostDamageResultDto {
    const ghost = this.ghosts.get(ghostId);

    if (!ghost || ghost.isDead) {
      return { ghostId, applied: false, newHp: 0, isDead: true, rejectedReason: 'ghost_not_found_or_dead' };
    }

    // Anti-cheat: validar distancia entre atacante y ghost
    const dist = Math.hypot(attackerX - ghost.positionX, attackerY - ghost.positionY);
    if (dist > MAX_ATTACK_DISTANCE) {
      this.logger.warn(`[AntiCheat] Ataque rechazado: ${attackerId} está a ${dist.toFixed(0)}px del ghost ${ghostId} (max: ${MAX_ATTACK_DISTANCE}px)`);
      return { ghostId, applied: false, newHp: ghost.hp, isDead: false, rejectedReason: 'attacker_too_far' };
    }

    // Anti-cheat: cooldown de ataque
    const cooldownKey = `${attackerId}:${ghostId}`;
    const lastAttack = this.attackCooldowns.get(cooldownKey);
    const now = Date.now();
    if (lastAttack && now - lastAttack.lastAttackTime < ATTACK_COOLDOWN_MS) {
      this.logger.warn(`[AntiCheat] Cooldown no cumplido: ${attackerId} atacó ghost ${ghostId} demasiado rápido`);
      return { ghostId, applied: false, newHp: ghost.hp, isDead: false, rejectedReason: 'cooldown_not_met' };
    }

    // Anti-cheat: cantidad de daño máxima
    const clampedAmount = Math.max(0, Math.min(amount, MAX_DAMAGE_PER_HIT));

    // Aplicar daño
    ghost.hp = Math.max(0, ghost.hp - clampedAmount);
    this.attackCooldowns.set(cooldownKey, { lastAttackTime: now });

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
  ): PlayerDamageResultDto {
    // En modo creativo el servidor NO confirma daño al jugador
    if (gameMode === 'creative') {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'creative_mode' };
    }

    // GodMode (POST /player/me/dev/godmode): el jugador es inmune al daño
    if (godMode === true) {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'god_mode' };
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

    // Aplicar daño al HP autoritativo del jugador
    playerRec.hp = Math.max(0, playerRec.hp - GHOST_CANON_DAMAGE_TO_PLAYER);
    if (playerRec.hp <= 0) playerRec.dead = true;

    this.logger.debug(`Ghost ${ghostId} attacked ${targetId} for ${GHOST_CANON_DAMAGE_TO_PLAYER} dmg`);

    return {
      applied: true,
      amount: GHOST_CANON_DAMAGE_TO_PLAYER,
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
   * El servidor decide daño (canónico por atacante; el player reporta monto
   * acotado a 200), valida distancia y cooldown, y decreta HP y muerte.
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
  }): CombatHitResultDto {
    const attackerKind = input.attackerKind as CombatEntityKind;
    const targetKind = input.targetKind as CombatEntityKind;
    if (!COMBAT_STATS[attackerKind] || !COMBAT_STATS[targetKind]) {
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: 0, targetMaxHp: 0, isDead: true, rejectedReason: 'unknown_kind',
      };
    }

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
      if (dist > MAX_ATTACK_DISTANCE) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: false,
          rejectedReason: 'attacker_too_far',
        };
      }
      const now = Date.now();
      const cdKey = `${input.attackerId}:${input.targetId}`;
      const last = this.hitCooldowns.get(cdKey);
      const cdMs = COMBAT_STATS[attackerKind].cooldownMs;
      if (last && now - last.lastAttackTime < cdMs) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: false,
          rejectedReason: 'cooldown_not_met',
        };
      }
      const damage = this.resolveDamage(attackerKind, input.amount);
      if (damage <= 0) {
        return {
          applied: false, damage: 0, targetId: input.targetId,
          targetHp: ghost.hp, targetMaxHp: ghost.maxHp, isDead: false,
          rejectedReason: 'invalid_damage',
        };
      }
      ghost.hp = Math.max(0, ghost.hp - damage);
      this.hitCooldowns.set(cdKey, { lastAttackTime: now });
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
    if (dist > MAX_MELEE_DISTANCE) {
      const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'attacker_too_far',
      };
    }

    const now = Date.now();
    const cdKey = `${input.attackerId}:${input.targetId}`;
    const last = this.hitCooldowns.get(cdKey);
    const cdMs = COMBAT_STATS[attackerKind].cooldownMs;
    if (last && now - last.lastAttackTime < cdMs) {
      const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'cooldown_not_met',
      };
    }

    const damage = this.resolveDamage(attackerKind, input.amount);
    if (damage <= 0) {
      const rec = this.getOrRegisterEntity(input.targetId, targetKind, input.settlementId);
      return {
        applied: false, damage: 0, targetId: input.targetId,
        targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
        rejectedReason: 'invalid_damage',
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
    rec.hp = Math.max(0, rec.hp - damage);
    this.hitCooldowns.set(cdKey, { lastAttackTime: now });
    if (rec.hp <= 0) rec.dead = true;
    return {
      applied: true, damage, targetId: input.targetId,
      targetHp: rec.hp, targetMaxHp: rec.maxHp, isDead: rec.dead,
    };
  }

  private resolveDamage(attackerKind: CombatEntityKind, amount?: number): number {
    const canon = ATTACKER_DAMAGE[attackerKind];
    if (typeof canon === 'number') return canon;
    // El player reporta su monto; el servidor lo acota (diseño existente de ghost:damage)
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
