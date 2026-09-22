import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TRAINING_XP,
  TRAINING_SCROLL_NAMES,
  describeEffect,
  findCatalogEntry,
  getConsumableEffect,
  getItemMeta,
  isStackableCategory,
  maxStackForCategory,
  parseSchool,
  scrollSchoolFromName,
  type ItemCategory,
  type SchoolId,
  type SkillState,
} from './item-catalog';
import { SKILL_IDS, MAX_SKILL_LEVEL } from './skills-defs';

export interface InventoryStack {
  id: string;
  nombre: string;
  categoria: ItemCategory;
  cantidad: number;
  maxStack: number;
  stackable: boolean;
  icono?: string;
  descripcion?: string;
}

export interface DevState {
  godMode: boolean;
}

export interface PlayerNeeds {
  /** 0 = saciado, 100 = hambriento/sediento. */
  hunger: number;
  thirst: number;
  /** Epoch ms de la última actualización del decaimiento. */
  updatedAt: number;
}

export interface GameState {
  inventory: InventoryStack[];
  skills: Record<SchoolId, SkillState[]>;
  dev: DevState;
  needs: PlayerNeeds;
}

/**
 * Saciedad: 20% dura 1h -> 100% dura 5h (0->100 en 5h).
 * 1 punto cada 180s.
 */
export const NEEDS_MS_PER_POINT = 180_000;
export const NEEDS_MAX = 100;

/** Consola del juego: kinds de spawn/create válidos y su rango por comando. */
export const SPAWN_ALLOW_RULES: Record<string, { min: number; max: number }> = {
  npc: { min: 1, max: 10 },
  'dead-dragon-ally': { min: 1, max: 5 },
  'dead-dragon-enemy': { min: 1, max: 5 },
  ghost: { min: 1, max: 3 },
};

export type SpawnKind = keyof typeof SPAWN_ALLOW_RULES;

function rid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function emptySkills(): Record<SchoolId, SkillState[]> {
  return {
    supervivencia: SKILL_IDS.supervivencia.map((id) => ({ id, level: 0, xp: 0, tier: 1, unlocked: true })),
    produccion: SKILL_IDS.produccion.map((id) => ({ id, level: 0, xp: 0, tier: 1, unlocked: true })),
    politica: SKILL_IDS.politica.map((id) => ({ id, level: 0, xp: 0, tier: 1, unlocked: true })),
    milicia: SKILL_IDS.milicia.map((id) => ({ id, level: 0, xp: 0, tier: 1, unlocked: true })),
    ciencias: SKILL_IDS.ciencias.map((id) => ({ id, level: 0, xp: 0, tier: 1, unlocked: true })),
    artes_misticas: SKILL_IDS.artes_misticas.map((id) => ({ id, level: 0, xp: 0, tier: 1, unlocked: true })),
  };
}

function emptyState(): GameState {
  return { inventory: [], skills: emptySkills(), dev: { godMode: false }, needs: { hunger: 0, thirst: 0, updatedAt: Date.now() } };
}

function isValidStack(s: unknown): s is InventoryStack {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.nombre === 'string' &&
    typeof o.categoria === 'string' &&
    typeof o.cantidad === 'number' &&
    Number.isInteger(o.cantidad) &&
    (o.cantidad as number) > 0
  );
}

function sanitize(raw: unknown): GameState {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.inventory)) {
    state.inventory = o.inventory.filter(isValidStack).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      categoria: s.categoria as ItemCategory,
      cantidad: Math.max(1, Math.floor(s.cantidad)),
      maxStack: typeof s.maxStack === 'number' ? s.maxStack : 10,
      stackable: s.stackable === true,
      ...(typeof s.icono === 'string' ? { icono: s.icono } : {}),
      ...(typeof s.descripcion === 'string' ? { descripcion: s.descripcion } : {}),
    }));
  }
  if (o.skills && typeof o.skills === 'object') {    const skills = o.skills as Record<string, unknown>;
    for (const school of Object.keys(SKILL_IDS) as SchoolId[]) {
      const validIds = new Set(SKILL_IDS[school]);
      if (!Array.isArray(skills[school])) continue;
      const seen = new Set<string>();
      for (const entry of skills[school] as unknown[]) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        if (typeof e.id !== 'string' || !validIds.has(e.id) || seen.has(e.id)) continue;
        seen.add(e.id);
        state.skills[school].find((s) => s.id === e.id)!.level =
          typeof e.level === 'number' ? Math.max(0, Math.min(100, Math.floor(e.level))) : 0;
        state.skills[school].find((s) => s.id === e.id)!.xp =
          typeof e.xp === 'number' ? Math.max(0, Math.min(99, Math.floor(e.xp))) : 0;
      }
    }
  }
  if (o.dev && typeof o.dev === 'object') {
    const dev = o.dev as Record<string, unknown>;
    if (dev.godMode === true) state.dev.godMode = true;
  }
  if (o.needs && typeof o.needs === 'object') {
    const nd = o.needs as Record<string, unknown>;
    if (typeof nd.hunger === 'number') state.needs.hunger = Math.max(0, Math.min(100, Math.floor(nd.hunger)));
    if (typeof nd.thirst === 'number') state.needs.thirst = Math.max(0, Math.min(100, Math.floor(nd.thirst)));
    if (typeof nd.updatedAt === 'number' && Number.isFinite(nd.updatedAt) && nd.updatedAt > 0) {
      state.needs.updatedAt = Math.floor(nd.updatedAt);
    }
  }
  return state;
}

/**
 * Decaimiento autoritativo de hambre/sed por tiempo real.
 * 1 punto cada NEEDS_MS_PER_POINT (180s) -> 100 en 5h.
 * GodMode congela las necesidades (no decaen).
 * Retorna true si hubo cambio (el llamador debe persistir).
 */
function applyNeedsDecay(state: GameState, now = Date.now()): boolean {
  if (state.dev.godMode) {
    if (state.needs.updatedAt !== now) state.needs.updatedAt = now;
    return true;
  }
  if (typeof state.needs.updatedAt !== 'number' || state.needs.updatedAt <= 0) {
    state.needs.updatedAt = now;
    return true;
  }
  if (now < state.needs.updatedAt) {
    state.needs.updatedAt = now;
    return true;
  }
  const elapsed = now - state.needs.updatedAt;
  const points = Math.floor(elapsed / NEEDS_MS_PER_POINT);
  if (points <= 0) return false;
  state.needs.hunger = Math.min(NEEDS_MAX, state.needs.hunger + points);
  state.needs.thirst = Math.min(NEEDS_MAX, state.needs.thirst + points);
  state.needs.updatedAt = state.needs.updatedAt + points * NEEDS_MS_PER_POINT;
  // Evita deriva si el reloj saltó mucho: ancla el resto al ahora
  if (now - state.needs.updatedAt >= NEEDS_MS_PER_POINT) state.needs.updatedAt = now;
  return true;
}

function pushEmptyContainer(state: GameState, emptiesTo: string): string | null {
  const emptyEntry = findCatalogEntry(emptiesTo);
  if (!emptyEntry) return null;
  const emptyMeta = getItemMeta(emptyEntry.nombre);
  pushStack(
    state,
    {
      nombre: emptyEntry.nombre,
      categoria: emptyEntry.categoria,
      maxStack: maxStackForCategory(emptyEntry.categoria),
      stackable: isStackableCategory(emptyEntry.categoria),
      ...(emptyMeta?.icono ? { icono: emptyMeta.icono } : {}),
      ...(emptyMeta?.descripcion ? { descripcion: emptyMeta.descripcion } : {}),
    },
    1,
  );
  return emptyEntry.nombre;
}

function applySkillXp(list: SkillState[], skillId: string, amount: number): void {
  const sk = list.find((s) => s.id === skillId);
  if (!sk) throw new NotFoundException('Habilidad no encontrada');
  let xp = sk.xp + amount;
  while (xp >= 100 && sk.level < 100) {
    xp -= 100;
    sk.level = Math.min(100, sk.level + (sk.level < 20 ? 5 : sk.level < 50 ? 3 : sk.level < 80 ? 2 : 1));
  }
  sk.xp = Math.min(99, xp);
  sk.unlocked = true;
  const avg = Math.round(list.reduce((a, s) => a + s.level, 0) / list.length);
  for (const s of list) {
    if (!s.unlocked) {
      if (s.tier === 2 && avg >= 15) s.unlocked = true;
      if (s.tier === 3 && avg >= 35) s.unlocked = true;
    }
  }
}

function applyCategoryXp(list: SkillState[], amount: number): void {
  for (const sk of list) {
    if (!sk.unlocked) continue;
    let xp = sk.xp + amount;
    if (xp >= 100 && sk.level < 100) {
      xp -= 100;
      sk.level = Math.min(100, sk.level + 1);
    }
    sk.xp = Math.min(99, xp);
  }
}

function pushStack(state: GameState, stack: Omit<InventoryStack, 'id' | 'cantidad'>, cantidad: number): void {
  let remaining = Math.max(1, Math.floor(cantidad));
  if (stack.stackable) {
    for (const s of state.inventory) {
      if (remaining <= 0) break;
      if (s.nombre === stack.nombre && s.categoria === stack.categoria && s.stackable) {
        const space = s.maxStack - s.cantidad;
        if (space > 0) {
          const take = Math.min(space, remaining);
          s.cantidad += take;
          remaining -= take;
        }
      }
    }
  }
  while (remaining > 0) {
    const take = stack.stackable ? Math.min(stack.maxStack, remaining) : 1;
    state.inventory.push({ ...stack, id: rid('pl'), cantidad: take });
    remaining -= take;
  }
}

function consumeByName(state: GameState, nombre: string, qty: number): void {
  const total = state.inventory.reduce((a, s) => (s.nombre === nombre ? a + s.cantidad : a), 0);
  if (total < qty) throw new BadRequestException('No tienes suficientes unidades');
  let remaining = qty;
  for (const s of state.inventory) {
    if (remaining <= 0) break;
    if (s.nombre !== nombre) continue;
    const take = Math.min(s.cantidad, remaining);
    s.cantidad -= take;
    remaining -= take;
  }
  state.inventory = state.inventory.filter((s) => s.cantidad > 0);
}

/**
 * Consume 1 unidad del stack EXACTO (por id). 9 -> 8 en ese stack;
 * solo elimina el stack si queda en 0. Nunca toca otros stacks.
 */
function consumeOneFromStack(state: GameState, stackId: string): void {
  const stack = state.inventory.find((s) => s.id === stackId);
  if (!stack) throw new NotFoundException('Item no encontrado en el inventario');
  if (!Number.isInteger(stack.cantidad) || stack.cantidad < 1) {
    throw new BadRequestException('Stack sin unidades disponibles');
  }
  stack.cantidad -= 1;
  if (stack.cantidad <= 0) {
    state.inventory = state.inventory.filter((s) => s.id !== stackId);
  }
}

@Injectable()
export class PlayerService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(playerId: string): Promise<{ state: GameState; settings: Record<string, unknown> }> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Player no encontrado');
    const settings = ((player.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    return { state: sanitize(settings.game), settings };
  }

  private async save(playerId: string, settings: Record<string, unknown>, state: GameState) {
    await this.prisma.player.update({
      where: { id: playerId },
      data: { settings: { ...settings, game: JSON.parse(JSON.stringify(state)) } as never },
    });
    return state;
  }

  async getInventory(playerId: string) {
    const { state, settings } = await this.load(playerId);
    if (applyNeedsDecay(state)) await this.save(playerId, settings, state);
    return state.inventory;
  }

  async getNeeds(playerId: string): Promise<PlayerNeeds> {
    const { state, settings } = await this.load(playerId);
    if (applyNeedsDecay(state)) await this.save(playerId, settings, state);
    return { ...state.needs };
  }

  async addItem(playerId: string, input: { nombre?: string; escuela?: string; cantidad: number }) {
    const qty = Math.floor(input.cantidad);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw new BadRequestException('La cantidad debe ser un entero del 1 al 999');
    }
    const hasNombre = typeof input.nombre === 'string' && input.nombre.trim().length > 0;
    const hasEscuela = typeof input.escuela === 'string' && input.escuela.trim().length > 0;
    if (hasNombre === hasEscuela) {
      throw new BadRequestException('Envía "nombre" o "escuela" (solo uno)');
    }
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    if (hasEscuela) {
      const school = parseSchool(input.escuela as string);
      if (!school) throw new BadRequestException('Escuela no reconocida');
      pushStack(
        state,
        {
          nombre: TRAINING_SCROLL_NAMES[school],
          categoria: 'Documentos',
          maxStack: 10,
          stackable: true,
          icono: '📜',
          descripcion: `Al leerlo, permite entrenar 1 vez la escuela (+${TRAINING_XP} XP).`,
        },
        qty,
      );
    } else {
      const entry = findCatalogEntry(input.nombre as string);
      if (!entry) throw new BadRequestException(`Item "${input.nombre}" no existe en el catálogo`);
      const meta = getItemMeta(entry.nombre);
      pushStack(
        state,
        {
          nombre: entry.nombre,
          categoria: entry.categoria,
          maxStack: maxStackForCategory(entry.categoria),
          stackable: isStackableCategory(entry.categoria),
          ...(meta?.icono ? { icono: meta.icono } : {}),
          ...(meta?.descripcion ? { descripcion: meta.descripcion } : {}),
        },
        qty,
      );
    }
    const saved = await this.save(playerId, settings, state);
    return saved.inventory;
  }

  async useItem(playerId: string, stackId: string) {
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    const stack = state.inventory.find((s) => s.id === stackId);
    if (!stack) throw new NotFoundException('Item no encontrado en el inventario');
    const school = scrollSchoolFromName(stack.nombre);
    if (school) {
      consumeByName(state, stack.nombre, 1);
      applyCategoryXp(state.skills[school], TRAINING_XP);
      const saved = await this.save(playerId, settings, state);
      return { inventory: saved.inventory, skills: saved.skills, xp: TRAINING_XP, escuela: school, needs: { ...saved.needs } };
    }
    // Consumibles de saciedad: efecto heredado de CONSUMABLE_EFFECTS
    // (Pan, Odre con Agua y los futuros que añadas al registro).
    // Consumo PRECISO del stack clicado (stackId): 9 -> 8 garantizado en
    // ESTE stack, sin tocar otros stacks del mismo item.
    const consumable = getConsumableEffect(stack.nombre);
    if (consumable && !consumable.effect.notUsable) {
      consumeOneFromStack(state, stack.id);
      if (consumable.effect.hunger) {
        state.needs.hunger = Math.max(0, state.needs.hunger - consumable.effect.hunger);
      }
      if (consumable.effect.thirst) {
        state.needs.thirst = Math.max(0, state.needs.thirst - consumable.effect.thirst);
      }
      state.needs.updatedAt = Date.now();
      const emptied = consumable.effect.emptiesTo ? pushEmptyContainer(state, consumable.effect.emptiesTo) : null;
      const saved = await this.save(playerId, settings, state);
      return {
        inventory: saved.inventory,
        skills: saved.skills,
        xp: 0,
        escuela: null,
        needs: { ...saved.needs },
        effect: describeEffect(consumable.effect, emptied),
      };
    }
    if (consumable?.effect.notUsable) {
      throw new ForbiddenException(
        consumable.effect.notUsableMessage ?? `${consumable.nombre} no se puede consumir directamente.`,
      );
    }
    if (
      stack.categoria === 'Comida y Bebida' ||
      stack.categoria === 'Consumibles Comunes' ||
      stack.categoria === 'Consumibles Magicos'
    ) {
      consumeOneFromStack(state, stack.id);
      const saved = await this.save(playerId, settings, state);
      return { inventory: saved.inventory, skills: saved.skills, xp: 0, escuela: null, needs: { ...saved.needs } };
    }
    throw new ForbiddenException(`${stack.nombre} no tiene un uso directo todavía`);
  }

  async removeStack(playerId: string, stackId: string) {
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    const idx = state.inventory.findIndex((s) => s.id === stackId);
    if (idx === -1) throw new NotFoundException('Item no encontrado en el inventario');
    state.inventory.splice(idx, 1);
    const saved = await this.save(playerId, settings, state);
    return saved.inventory;
  }

  async getSkills(playerId: string) {
    const { state, settings } = await this.load(playerId);
    if (applyNeedsDecay(state)) await this.save(playerId, settings, state);
    return state.skills;
  }

  async train(playerId: string, input: { escuela: string; skillId?: string }) {
    const school = parseSchool(input.escuela);
    if (!school) throw new BadRequestException('Escuela no reconocida');
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    const scrollName = TRAINING_SCROLL_NAMES[school];
    const total = state.inventory.reduce((a, s) => (s.nombre === scrollName ? a + s.cantidad : a), 0);
    if (total < 1) {
      throw new ForbiddenException(`Necesitas 1 ${scrollName} para entrenar`);
    }
    consumeByName(state, scrollName, 1);
    if (input.skillId) {
      applySkillXp(state.skills[school], input.skillId, TRAINING_XP);
    } else {
      applyCategoryXp(state.skills[school], TRAINING_XP);
    }
    const saved = await this.save(playerId, settings, state);
    return { inventory: saved.inventory, skills: saved.skills, xp: TRAINING_XP, needs: { ...saved.needs } };
  }

  async getDev(playerId: string): Promise<DevState> {
    const { state, settings } = await this.load(playerId);
    if (applyNeedsDecay(state)) await this.save(playerId, settings, state);
    return state.dev;
  }

  async setGodMode(playerId: string, on: boolean): Promise<DevState> {
    const { state, settings } = await this.load(playerId);
    state.dev.godMode = on === true;
    if (on === true) {
      // GodMode: inmune a hambre/sed, todo al 100% (saciado = 0)
      state.needs.hunger = 0;
      state.needs.thirst = 0;
    }
    state.needs.updatedAt = Date.now();
    const saved = await this.save(playerId, settings, state);
    return saved.dev;
  }

  async grantFullMode(playerId: string) {
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    for (const school of Object.keys(SKILL_IDS) as SchoolId[]) {
      for (const sk of state.skills[school]) {
        sk.level = MAX_SKILL_LEVEL;
        sk.xp = 0;
        sk.unlocked = true;
      }
    }
    const saved = await this.save(playerId, settings, state);
    return saved.skills;
  }

  /**
   * Puerta de validación de la consola: todo comando create/spawn debe pasar
   * por aquí con JWT antes de que el cliente emita el evento a Phaser.
   * No persiste nada; solo valida kind + rango.
   */
  allowSpawn(kind: string, count: number): { ok: true; kind: string; count: number } {
    const rule = SPAWN_ALLOW_RULES[kind];
    if (!rule) {
      throw new BadRequestException(`Tipo de spawn no reconocido: "${kind}"`);
    }
    const n = Math.floor(count);
    if (!Number.isInteger(n) || n < rule.min || n > rule.max) {
      throw new BadRequestException(`La cantidad para "${kind}" debe ser un entero del ${rule.min} al ${rule.max}`);
    }
    return { ok: true, kind, count: n };
  }
}
