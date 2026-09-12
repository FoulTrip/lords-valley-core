import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GhostStateDto,
  GhostDamageResultDto,
  PlayerDamageResultDto,
} from './dto/ghost.dto';

/** Distancia máxima aceptable entre atacante y ghost (px en mundo iso) */
const MAX_ATTACK_DISTANCE = 150;

/** Cooldown mínimo entre ataques del mismo atacante al mismo ghost (ms) */
const ATTACK_COOLDOWN_MS = 800;

/** Daño máximo que el servidor acepta de una sola petición */
const MAX_DAMAGE_PER_HIT = 200;

/**
 * Estadísticas canónicas de un Ghost según el servidor.
 * Estos valores NO pueden ser modificados por el cliente.
 */
const GHOST_CANON_MAX_HP = 600;
const GHOST_CANON_MAX_ENERGIA = 100;
const GHOST_CANON_DAMAGE_TO_PLAYER = 15;
const GHOST_CANON_ATTACK_COOLDOWN_MS = 1200;

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
   * Spawna 1-3 ghosts para un settlement.
   * Retorna el estado autoritativo de cada ghost creado.
   */
  spawnGhosts(settlementId: string, count = 1, basePosition?: { x: number; y: number }): GhostStateDto[] {
    const clamped = Math.max(1, Math.min(3, count));
    const results: GhostStateDto[] = [];

    for (let i = 0; i < clamped; i++) {
      const id = `ghost_${randomUUID()}`;

      // Posición de spawn: cerca del centro del settlement si no se provee
      const cx = basePosition?.x ?? 3072;
      const cy = basePosition?.y ?? 3072;
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
  ): PlayerDamageResultDto {
    // En modo creativo el servidor NO confirma daño al jugador
    if (gameMode === 'creative') {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'creative_mode' };
    }

    const ghost = this.ghosts.get(ghostId);
    if (!ghost || ghost.isDead) {
      return { applied: false, amount: 0, targetId, settlementId, rejectedReason: 'ghost_not_found_or_dead' };
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

    this.logger.debug(`Ghost ${ghostId} attacked ${targetId} for ${GHOST_CANON_DAMAGE_TO_PLAYER} dmg`);

    return {
      applied: true,
      amount: GHOST_CANON_DAMAGE_TO_PLAYER,
      targetId,
      settlementId,
    };
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
