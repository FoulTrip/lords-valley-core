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
  emptySockets,
  findCatalogEntry,
  getConsumableCombat,
  getConsumableEffect,
  getEquipmentStats,
  getItemMeta,
  getWeaponStats,
  isStackableCategory,
  maxDurabilityForQuality,
  maxStackForCategory,
  parseSchool,
  sanitizeSockets,
  scrollSchoolFromName,
  type EquipmentSockets,
  type ItemCategory,
  type ItemQuality,
  type SchoolId,
  type SkillState,
  type TimedBuff,
  type TimedBuffKind,
} from './item-catalog';
import { CombatService } from '../combat/combat.service';
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
  calidad?: 'comun'|'bueno'|'raro'|'notable'|'sobresaliente'|'excelente'|'obra maestra'|'legendario'|'dios';
  durabilidad?: number;
  /** Engarces de la pieza (solo Armas/Equipo; vacíos por ahora). */
  sockets?: EquipmentSockets;
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

export type EquipSlot = 'arma' | 'arma1' | 'arma2' | 'armadura' | 'casco' | 'botas' | 'guantes' | 'escudo' | 'collar' | 'anillo' | 'capa';

export interface PlayerEquipment {
  /** Nombre canónico del arma equipada en slot 1 (catálogo Armas) o null. */
  weapon: string | null;
  /** Nombre canónico del arma equipada en slot 2 (independiente) o null. */
  weapon2?: string | null;
  /** Slot de arma activo en combate: 1 o 2. */
  activeWeapon?: 1 | 2;
  /** Nombre canónico del equipo equipado (catálogo Equipo) o null. */
  armor: string | null;
  helmet?: string | null;
  boots?: string | null;
  gloves?: string | null;
  shield?: string | null;
  necklace?: string | null;
  ring?: string | null;
  cape?: string | null;
  /** Calidad del item equipado por slot (solo Armas/Equipo la usan en combate). */
  weaponCalidad?: ItemQuality | null;
  weapon2Calidad?: ItemQuality | null;
  armorCalidad?: ItemQuality | null;
  helmetCalidad?: ItemQuality | null;
  bootsCalidad?: ItemQuality | null;
  glovesCalidad?: ItemQuality | null;
  shieldCalidad?: ItemQuality | null;
  necklaceCalidad?: ItemQuality | null;
  ringCalidad?: ItemQuality | null;
  capeCalidad?: ItemQuality | null;
  /** Durabilidad restante del item equipado por slot. */
  weaponDurabilidad?: number | null;
  weapon2Durabilidad?: number | null;
  armorDurabilidad?: number | null;
  helmetDurabilidad?: number | null;
  bootsDurabilidad?: number | null;
  glovesDurabilidad?: number | null;
  shieldDurabilidad?: number | null;
  necklaceDurabilidad?: number | null;
  ringDurabilidad?: number | null;
  capeDurabilidad?: number | null;
  /** Engarces de la pieza equipada por slot (modelo + UI; sin bonus por ahora). */
  weaponSockets?: EquipmentSockets | null;
  weapon2Sockets?: EquipmentSockets | null;
  armorSockets?: EquipmentSockets | null;
  helmetSockets?: EquipmentSockets | null;
  bootsSockets?: EquipmentSockets | null;
  glovesSockets?: EquipmentSockets | null;
  shieldSockets?: EquipmentSockets | null;
  necklaceSockets?: EquipmentSockets | null;
  ringSockets?: EquipmentSockets | null;
  capeSockets?: EquipmentSockets | null;
}

const VALID_QUALITIES: ReadonlySet<string> = new Set([
  'comun', 'bueno', 'raro', 'notable', 'sobresaliente',
  'excelente', 'obra maestra', 'legendario', 'dios',
]);

function asQuality(v: unknown): ItemQuality | null {
  return typeof v === 'string' && VALID_QUALITIES.has(v.toLowerCase())
    ? (v.toLowerCase() as ItemQuality)
    : null;
}

function asDurability(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(1000, v))
    : null;
}

export interface GameState {
  inventory: InventoryStack[];
  skills: Record<SchoolId, SkillState[]>;
  dev: DevState;
  needs: PlayerNeeds;
  /** Equipo del jugador (armas y armaduras equipables por player y NPCs). */
  equipment: PlayerEquipment;
  /** +daño base permanente (Elixir de Fuerza, acumulable). */
  damageBonus: number;
  /** Buffs temporizados vigentes (tónico/ungüento/frío). */
  buffs: TimedBuff[];
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
  return {
    inventory: [],
    skills: emptySkills(),
    dev: { godMode: false },
    needs: { hunger: 0, thirst: 0, updatedAt: Date.now() },
    equipment: { weapon: null, weapon2: null, activeWeapon: 1, armor: null, helmet: null, boots: null, gloves: null, shield: null, necklace: null, ring: null, cape: null },
    damageBonus: 0,
    buffs: [],
  };
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
      ...(typeof s.calidad === 'string' ? { calidad: s.calidad as InventoryStack['calidad'] } : {}),
      ...(typeof s.durabilidad === 'number' ? { durabilidad: Math.max(0, Math.min(1000, s.durabilidad)) } : {}),
      ...((s.categoria === 'Armas' || s.categoria === 'Equipo') && s.sockets !== undefined
        ? { sockets: sanitizeSockets(s.sockets as unknown) }
        : {}),
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
  if (o.equipment && typeof o.equipment === 'object') {
    const eq = o.equipment as Record<string, unknown>;
    if (typeof eq.weapon === 'string' && getWeaponStats(eq.weapon)) state.equipment.weapon = getWeaponStats(eq.weapon)!.nombre;
    if (typeof eq.weapon2 === 'string' && getWeaponStats(eq.weapon2)) state.equipment.weapon2 = getWeaponStats(eq.weapon2)!.nombre;
    if (eq.activeWeapon === 2) state.equipment.activeWeapon = 2;
    if (typeof eq.armor === 'string' && getEquipmentStats(eq.armor)) state.equipment.armor = getEquipmentStats(eq.armor)!.nombre;
    // Resto de slots de equipo: se restauran igual que el arma y la armadura
    // (antes se perdían al recargar porque solo se validaba 'armor').
    const EQUIP_NAME_TO_KEY = { helmet: 'helmet', boots: 'boots', gloves: 'gloves', shield: 'shield', necklace: 'necklace', ring: 'ring', cape: 'cape' } as const;
    for (const [rawKey, stateKey] of Object.entries(EQUIP_NAME_TO_KEY)) {
      const v = eq[rawKey];
      if (typeof v === 'string' && getEquipmentStats(v)) {
        (state.equipment as unknown as Record<string, unknown>)[stateKey] = getEquipmentStats(v)!.nombre;
      }
    }
    for (const slot of ['weapon', 'weapon2', 'armor', 'helmet', 'boots', 'gloves', 'shield', 'necklace', 'ring', 'cape'] as const) {
      const q = asQuality((eq as Record<string, unknown>)[`${slot}Calidad`]);
      if (q) (state.equipment as unknown as Record<string, unknown>)[`${slot}Calidad`] = q;
      const d = asDurability((eq as Record<string, unknown>)[`${slot}Durabilidad`]);
      if (d !== null) (state.equipment as unknown as Record<string, unknown>)[`${slot}Durabilidad`] = d;
      const so = (eq as Record<string, unknown>)[`${slot}Sockets`];
      if (so !== undefined && so !== null) {
        (state.equipment as unknown as Record<string, unknown>)[`${slot}Sockets`] = sanitizeSockets(so);
      }
    }
  }
  if (typeof o.damageBonus === 'number' && Number.isFinite(o.damageBonus)) {
    state.damageBonus = Math.max(0, Math.floor(o.damageBonus));
  }
  if (Array.isArray(o.buffs)) {
    const now = Date.now();
    const kinds: TimedBuffKind[] = ['resist_fire', 'resist_cold', 'immune_negative', 'immune_burn', 'hot', 'attack_slow', 'move_slow', 'damage_boost', 'invisible'];
    for (const b of o.buffs as unknown[]) {
      if (!b || typeof b !== 'object') continue;
      const e = b as Record<string, unknown>;
      if (!kinds.includes(e.kind as TimedBuffKind)) continue;
      if (typeof e.value !== 'number' || !Number.isFinite(e.value)) continue;
      if (typeof e.expiresAt !== 'number' || e.expiresAt <= now) continue;
      state.buffs.push({ kind: e.kind as TimedBuffKind, value: e.value, expiresAt: Math.floor(e.expiresAt) });
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly combat: CombatService,
  ) {}

  private async load(playerId: string): Promise<{ state: GameState; settings: Record<string, unknown> }> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Player no encontrado');
    const settings = ((player.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    return { state: sanitize(settings.game), settings };
  }

  private async save(playerId: string, settings: Record<string, unknown>, state: GameState) {
    // Sanitize inventory: remove stacks exceeding max, consider exploit
    state.inventory = state.inventory.filter(s => {
      const max = maxStackForCategory(s.categoria);
      if (s.cantidad > max) {
        // Exploit detected: delete slot entirely
        return false;
      }
      return s.cantidad > 0;
    });
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

  async addItem(playerId: string, input: { nombre?: string; escuela?: string; cantidad: number; calidad?: 'comun'|'bueno'|'raro'|'notable'|'sobresaliente'|'excelente'|'obra maestra'|'legendario'|'dios' }) {
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
       const isWeaponOrEquip = entry.categoria === 'Armas' || entry.categoria === 'Equipo';
       pushStack(
         state,
         {
           nombre: entry.nombre,
           categoria: entry.categoria,
           maxStack: maxStackForCategory(entry.categoria),
           stackable: isStackableCategory(entry.categoria),
           ...(meta?.icono ? { icono: meta.icono } : {}),
           ...(meta?.descripcion ? { descripcion: meta.descripcion } : {}),
           ...(isWeaponOrEquip && input.calidad ? { calidad: input.calidad } : {}),
           ...(isWeaponOrEquip ? { durabilidad: maxDurabilityForQuality(input.calidad ?? 'comun') } : {}),
           ...(isWeaponOrEquip ? { sockets: emptySockets() } : {}),
         },
         qty,
       );
    }
    const saved = await this.save(playerId, settings, state);
    return saved.inventory;
  }

  async reduceDurability(playerId: string, stackId: string, damagePercent: number) {
    const { state, settings } = await this.load(playerId);
    const stack = state.inventory.find(s => s.id === stackId);
    if (!stack) throw new Error('Stack not found');
    const current = typeof stack.durabilidad === 'number'
      ? stack.durabilidad
      : maxDurabilityForQuality(stack.calidad ?? 'comun');
    const newDur = Math.max(0, current - damagePercent);
    stack.durabilidad = Math.round(newDur * 10) / 10;
    await this.save(playerId, settings, state);
    return stack.durabilidad;
  }

  async useItem(playerId: string, input: { stackId: string; x?: number; y?: number; settlementId?: string }) {
    const { stackId } = input;
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
    // (todas las comidas y cosechas con hambre/sed lo heredan sin más cambios).
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
    // Efectos de combate (pociones, elixir, vendas, pergaminos de área...)
    const combatFx = getConsumableCombat(stack.nombre);
    if (combatFx) {
      return this.applyCombatConsumable(playerId, state, settings, stack, combatFx.nombre, input);
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

  /**
   * Aplica el efecto de combate de un consumible y consume 1 unidad.
   * Cura/manā/buffs van al registro de combate en memoria (entidad 'player');
   * elixir y buffs temporizados además persisten en GameState.
   */
  private async applyCombatConsumable(
    playerId: string,
    state: GameState,
    settings: Record<string, unknown>,
    stack: InventoryStack,
    nombre: string,
    input: { x?: number; y?: number; settlementId?: string },
  ) {
    const fx = getConsumableCombat(nombre);
    if (!fx) throw new ForbiddenException(`${nombre} no tiene un uso directo todavía`);
    const now = Date.now();
    const settlementId = typeof input.settlementId === 'string' ? input.settlementId : '';

    // Pergaminos de área: requieren posición del lanzador (la envía el juego).
    if (fx.aoe) {
      if (typeof input.x !== 'number' || typeof input.y !== 'number' || !settlementId) {
        throw new BadRequestException(
          `${nombre} se lanza desde el juego: ábrelo cerca de enemigos (requiere posición).`,
        );
      }
      consumeOneFromStack(state, stack.id);
      await this.save(playerId, settings, state);
      const res = this.combat.applyScrollAoe({
        casterId: 'player',
        x: input.x,
        y: input.y,
        settlementId,
        scroll: nombre as 'Pergamino de Fuego' | 'Pergamino de Frío',
      });
      const extra = fx.aoe.slow
        ? ' + ralentización -20% ataque/movimiento'
        : '';
      return {
        inventory: state.inventory,
        skills: state.skills,
        xp: 0,
        escuela: null,
        needs: { ...state.needs },
        effect: `${nombre}: +${fx.aoe.damage} en ${fx.aoe.radiusTiles} tiles a ${res.hits.length} objetivo(s) + daño +${fx.aoe.dot.damage}/${fx.aoe.dot.durationSec}s${extra}.`,
        hits: res.hits,
        buffs: state.buffs.filter((b) => b.expiresAt > Date.now()),
      };
    }

    consumeOneFromStack(state, stack.id);
    const notes: string[] = [];
    if (fx.heal) {
      const r = this.combat.healEntity('player', 'player', settlementId, fx.heal);
      notes.push(`+${fx.heal} vida (${Math.round(r.hp)}/${r.maxHp})`);
    }
    if (fx.mana) {
      const r = this.combat.addMana('player', 'player', settlementId, fx.mana);
      notes.push(`+${fx.mana} maná (${Math.round(r.mana)}/${r.maxMana})`);
    }
    if (fx.damageBuff) {
      state.damageBonus = Math.max(0, state.damageBonus + fx.damageBuff);
      this.combat.syncLoadoutBuffs(
        this.combat.findTargetRecord('player', 'player', settlementId) ?? { buffs: [], damageBonus: 0 },
        { damageBonus: state.damageBonus },
        now,
      );
      notes.push(`+${fx.damageBuff} daño base permanente (total +${state.damageBonus})`);
    }
    if (fx.damageBoost) {
      state.buffs = state.buffs.filter((b) => b.kind !== 'damage_boost');
      state.buffs.push({ kind: 'damage_boost', value: fx.damageBoost.bonus, expiresAt: now + fx.damageBoost.secs * 1000 });
      notes.push(`+${fx.damageBoost.bonus} daño base durante ${fx.damageBoost.secs}s (furia)`);
    }
    if (fx.invisibleSec) {
      state.buffs = state.buffs.filter((b) => b.kind !== 'invisible');
      state.buffs.push({ kind: 'invisible', value: 1, expiresAt: now + fx.invisibleSec * 1000 });
      notes.push(`invisible ${fx.invisibleSec}s: indetectable para enemigos`);
    }
    if (fx.cleanseBleed || fx.cleanseAll) {      const rec = this.combat.findTargetRecord('player', 'player', settlementId);
      const removed = this.combat.cleanseEntity(rec, fx.cleanseAll ? 'all' : 'hemorragia');
      notes.push(fx.cleanseAll ? `purga total (${removed} efectos)` : `hemorragia purgada (${removed})`);
    }
    const pushBuff = (kind: TimedBuff['kind'], value: number, secs: number) => {
      state.buffs = state.buffs.filter((b) => b.kind !== kind);
      state.buffs.push({ kind, value, expiresAt: now + secs * 1000 });
    };
    if (fx.resistFire && fx.resistDurationSec) {
      pushBuff('resist_fire', fx.resistFire, fx.resistDurationSec);
      notes.push(`+${Math.round(fx.resistFire * 100)}% resistencia al fuego ${fx.resistDurationSec}s`);
    }
    if (fx.resistCold && fx.resistDurationSec) {
      pushBuff('resist_cold', fx.resistCold, fx.resistDurationSec);
      notes.push(`+${Math.round(fx.resistCold * 100)}% resistencia al frío ${fx.resistDurationSec}s`);
    }
    if (fx.immuneNegativeSec) {
      pushBuff('immune_negative', 1, fx.immuneNegativeSec);
      notes.push(`inmunidad a efectos negativos ${fx.immuneNegativeSec}s`);
    }
    if (fx.immuneBurn && fx.immuneBurnSec) {
      pushBuff('immune_burn', 1, fx.immuneBurnSec);
      notes.push(`inmunidad a quemaduras ${fx.immuneBurnSec}s`);
    }
    if (fx.healOverTime) {
      const perTick = fx.healOverTime.total / Math.max(1, fx.healOverTime.durationSec);
      pushBuff('hot', perTick, fx.healOverTime.durationSec);
      notes.push(`+${fx.healOverTime.total} vida durante ${fx.healOverTime.durationSec}s`);
    }
    if (state.buffs.length > 0) {
      this.combat.syncLoadoutBuffs(
        this.combat.findTargetRecord('player', 'player', settlementId) ?? { buffs: [], damageBonus: 0 },
        { buffs: state.buffs },
        now,
      );
    }
    const saved = await this.save(playerId, settings, state);
    return {
      inventory: saved.inventory,
      skills: saved.skills,
      xp: 0,
      escuela: null,
      needs: { ...saved.needs },
      equipment: { ...saved.equipment },
      damageBonus: saved.damageBonus,
      buffs: saved.buffs.filter((b) => b.expiresAt > Date.now()),
      effect: notes.length > 0 ? `${nombre}: ${notes.join(' · ')}.` : `${nombre} usado.`,
    };
  }

  /** Buffs temporizados vigentes del jugador (expirados podados y persistidos). */
  async getBuffs(playerId: string): Promise<TimedBuff[]> {
    const { state, settings } = await this.load(playerId);
    const now = Date.now();
    const active = state.buffs.filter((b) => b.expiresAt > now);
    if (active.length !== state.buffs.length) {
      state.buffs = active;
      await this.save(playerId, settings, state);
    } else if (applyNeedsDecay(state)) {
      await this.save(playerId, settings, state);
    }
    return active.map((b) => ({ ...b }));
  }

  async getEquipment(playerId: string): Promise<PlayerEquipment> {
    const { state, settings } = await this.load(playerId);
    if (applyNeedsDecay(state)) await this.save(playerId, settings, state);
    return { ...state.equipment };
  }

  private slotKey(equipment: PlayerEquipment, slot: EquipSlot): 'weapon' | 'weapon2' | 'armor' | 'helmet' | 'boots' | 'gloves' | 'shield' | 'necklace' | 'ring' | 'cape' {
    switch (slot) {
      case 'arma': return equipment.activeWeapon === 2 ? 'weapon2' : 'weapon';
      case 'arma1': return 'weapon';
      case 'arma2': return 'weapon2';
      case 'armadura': return 'armor';
      case 'casco': return 'helmet';
      case 'botas': return 'boots';
      case 'guantes': return 'gloves';
      case 'escudo': return 'shield';
      case 'collar': return 'necklace';
      case 'anillo': return 'ring';
      case 'capa': return 'cape';
      default: return 'armor';
    }
  }

  private getPrevEquipmentFull(equipment: PlayerEquipment, slot: EquipSlot): { name: string | null; calidad: ItemQuality | null; durabilidad: number | null; sockets: EquipmentSockets | null } {
    const key = this.slotKey(equipment, slot);
    return {
      name: (equipment[key] as string | null | undefined) ?? null,
      calidad: asQuality((equipment as unknown as Record<string, unknown>)[`${key}Calidad`]),
      durabilidad: asDurability((equipment as unknown as Record<string, unknown>)[`${key}Durabilidad`]),
      sockets: sanitizeSockets((equipment as unknown as Record<string, unknown>)[`${key}Sockets`]),
    };
  }

  private setEquipmentBySlot(equipment: PlayerEquipment, slot: EquipSlot, name: string | null, calidad?: ItemQuality | null, durabilidad?: number | null, sockets?: EquipmentSockets | null) {
    const key = this.slotKey(equipment, slot);
    (equipment as unknown as Record<string, unknown>)[key] = name;
    (equipment as unknown as Record<string, unknown>)[`${key}Calidad`] = calidad ?? null;
    (equipment as unknown as Record<string, unknown>)[`${key}Durabilidad`] = typeof durabilidad === 'number' ? durabilidad : null;
    (equipment as unknown as Record<string, unknown>)[`${key}Sockets`] = sockets ? sanitizeSockets(sockets) : null;
  }

  /**
   * Equipa un arma (slots 'arma1'/'arma2') o una pieza de equipo
   * ('armadura', 'casco', 'botas', 'guantes', 'escudo', 'collar', 'anillo',
   * 'capa') desde un stack del inventario. El stack sale del inventario;
   * lo que hubiera equipado vuelve. Valida el nombre contra el catálogo.
   */
  async equipItem(playerId: string, stackId: string, targetSlot?: string): Promise<{ inventory: InventoryStack[]; equipment: PlayerEquipment; slot: EquipSlot }> {
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    const idx = state.inventory.findIndex((s) => s.id === stackId);
    if (idx === -1) throw new NotFoundException('Item no encontrado en el inventario');
    const stack = state.inventory[idx];
    let slot: EquipSlot;
    let canonical: string;
    const weapon = getWeaponStats(stack.nombre);
    const armor = getEquipmentStats(stack.nombre);
    if (weapon) {
      if (targetSlot === 'arma1' || targetSlot === 'arma2') {
        slot = targetSlot;
      } else if (targetSlot && targetSlot !== 'arma') {
        throw new BadRequestException('Ese slot no admite armas (usa arma1 o arma2).');
      } else if (!state.equipment.weapon) {
        slot = 'arma1';
      } else if (!state.equipment.weapon2) {
        slot = 'arma2';
      } else {
        slot = state.equipment.activeWeapon === 2 ? 'arma2' : 'arma1';
      }
      canonical = weapon.nombre;
    } else if (armor) {
      if (targetSlot === 'arma1' || targetSlot === 'arma2') {
        throw new BadRequestException('Ese slot solo admite armas.');
      }
      // Mapeo de nombre a slot de equipo (misma tabla que el frontend:
      // EquippedSlotsGrid.equipoSlotForName; la Capa va en su propio slot).
      const n = stack.nombre.toLowerCase();
      if (n.includes('capa')) slot = 'capa';
      else if (n.includes('cota') || n.includes('túnica') || n.includes('tunica') || n.includes('pecho') || n.includes('coraza')) slot = 'armadura';
      else if (n.includes('casco') || n.includes('yelmo')) slot = 'casco';
      else if (n.includes('bota')) slot = 'botas';
      else if (n.includes('guante')) slot = 'guantes';
      else if (n.includes('escudo')) slot = 'escudo';
      else if (n.includes('collar') || n.includes('amuleto')) slot = 'collar';
      else if (n.includes('anillo')) slot = 'anillo';
      else slot = 'armadura'; // default
      if (targetSlot && targetSlot !== slot) {
        throw new BadRequestException(`"${stack.nombre}" va en el slot "${slot}".`);
      }
      canonical = armor.nombre;
    } else {
      throw new BadRequestException(`"${stack.nombre}" no es equipable (solo Armas y Equipo).`);
    }
    // Saca 1 unidad del stack (las armas/equipo no apilan: cantidad 1)
    if (stack.cantidad > 1) {
      stack.cantidad -= 1;
    } else {
      state.inventory.splice(idx, 1);
    }
    // Devuelve lo equipado al inventario (conservando calidad, durabilidad y engarces)
    const prev = this.getPrevEquipmentFull(state.equipment, slot);
    if (prev.name) {
      const entry = findCatalogEntry(prev.name);
      if (entry) {
        const meta = getItemMeta(prev.name);
        const prevCalidad = prev.calidad ?? 'comun';
        pushStack(
          state,
          {
            nombre: entry.nombre,
            categoria: entry.categoria,
            maxStack: maxStackForCategory(entry.categoria),
            stackable: isStackableCategory(entry.categoria),
            ...(meta?.icono ? { icono: meta.icono } : {}),
            ...(meta?.descripcion ? { descripcion: meta.descripcion } : {}),
            ...(prev.calidad ? { calidad: prev.calidad } : {}),
            ...(typeof prev.durabilidad === 'number'
              ? { durabilidad: prev.durabilidad }
              : { durabilidad: maxDurabilityForQuality(prevCalidad) }),
            sockets: prev.sockets ?? emptySockets(),
          },
          1,
        );
      }
    }
    this.setEquipmentBySlot(
      state.equipment,
      slot,
      canonical,
      asQuality(stack.calidad) ?? 'comun',
      typeof stack.durabilidad === 'number' ? stack.durabilidad : maxDurabilityForQuality(asQuality(stack.calidad) ?? 'comun'),
      stack.sockets ? sanitizeSockets(stack.sockets) : emptySockets(),
    );
    const saved = await this.save(playerId, settings, state);
    return { inventory: saved.inventory, equipment: { ...saved.equipment }, slot };
  }

  /** Desequipa un slot y devuelve el item al inventario. */
  async unequipSlot(playerId: string, slot: EquipSlot): Promise<{ inventory: InventoryStack[]; equipment: PlayerEquipment }> {
    const { state, settings } = await this.load(playerId);
    applyNeedsDecay(state);
    const prev = this.getPrevEquipmentFull(state.equipment, slot);
    if (!prev.name) throw new BadRequestException(`No hay nada equipado en "${slot}".`);
    const entry = findCatalogEntry(prev.name);
    if (!entry) throw new BadRequestException(`Item equipado desconocido: "${prev.name}".`);
    const meta = getItemMeta(prev.name);
    const prevCalidad = prev.calidad ?? 'comun';
    pushStack(
      state,
      {
        nombre: entry.nombre,
        categoria: entry.categoria,
        maxStack: maxStackForCategory(entry.categoria),
        stackable: isStackableCategory(entry.categoria),
        ...(meta?.icono ? { icono: meta.icono } : {}),
        ...(meta?.descripcion ? { descripcion: meta.descripcion } : {}),
        ...(prev.calidad ? { calidad: prev.calidad } : {}),
        ...(typeof prev.durabilidad === 'number'
          ? { durabilidad: prev.durabilidad }
          : { durabilidad: maxDurabilityForQuality(prevCalidad) }),
        sockets: prev.sockets ?? emptySockets(),
      },
      1,
    );
    this.setEquipmentBySlot(state.equipment, slot, null);
    const saved = await this.save(playerId, settings, state);
    return { inventory: saved.inventory, equipment: { ...saved.equipment } };
  }

  /** Cambia el arma activa en combate entre arma1 y arma2 (independientes). */
  async setActiveWeapon(playerId: string, slot: string): Promise<{ inventory: InventoryStack[]; equipment: PlayerEquipment }> {
    if (slot !== 'arma1' && slot !== 'arma2') {
      throw new BadRequestException('Slot de arma no válido (usa arma1 o arma2).');
    }
    const { state, settings } = await this.load(playerId);
    state.equipment.activeWeapon = slot === 'arma2' ? 2 : 1;
    const saved = await this.save(playerId, settings, state);
    return { inventory: saved.inventory, equipment: { ...saved.equipment } };
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
