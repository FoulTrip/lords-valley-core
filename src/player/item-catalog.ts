export type ItemCategory =
  | 'Armas'
  | 'Equipo'
  | 'Consumibles Magicos'
  | 'Consumibles Comunes'
  | 'Comida y Bebida'
  | 'Recurso Refinado'
  | 'Recursos en Bruto'
  | 'Utiles'
  | 'Crias'
  | 'Documentos';

export type SchoolId =
  | 'supervivencia'
  | 'produccion'
  | 'politica'
  | 'milicia'
  | 'ciencias'
  | 'artes_misticas';

export interface SkillState {
  id: string;
  level: number;
  xp: number;
  tier: 1 | 2 | 3;
  unlocked: boolean;
}

export const TRAINING_XP = 10;
export const MAX_STACK = 20;

const STACKABLE: ItemCategory[] = [
  'Consumibles Magicos',
  'Consumibles Comunes',
  'Comida y Bebida',
  'Recurso Refinado',
  'Recursos en Bruto',
  'Documentos',
];

export function isStackableCategory(categoria: ItemCategory): boolean {
  return STACKABLE.includes(categoria);
}

export function maxStackForCategory(categoria: ItemCategory): number {
  return isStackableCategory(categoria) ? MAX_STACK : 1;
}

export type WarehouseCategory = 'mineral' | 'madera' | 'comida';

const MINERAL_ITEMS = new Set([
  'mineraldecobre', 'mineraldeestano', 'mineraldehierro', 'mineraldeplata', 'mineraldeoro', 'mineraldecarbon',
  'cobre', 'estano', 'hierro', 'plata', 'oro', 'carbon', 'piedra', 'marmol',
  'lingotedehierro', 'lingotedecobre', 'lingotedeoro', 'lingotedeplata'
]);

const MADERA_ITEMS = new Set([
  'madera', 'tablondemadera', 'tablas', 'tablon', 'tablones', 'lena', 'tronco', 'troncos'
]);

const COMIDA_ITEMS = new Set([
  'pan', 'carneseca', 'manzana', 'queso', 'pescado', 'cerveza', 'agua', 'odreconagua', 'odrevacio',
  'racionesdecomida', 'carne', 'trigo',
  'gavillasdetrigo', 'mazorcasdemaiz', 'costalesdearroz',
  'cajondetomates', 'sacodezanahorias', 'sacosdepatatas', 'cestasdecoliflor', 'sartadechiles', 'cestadechampinones',
  'cestasdefresas', 'canastosdeuva', 'sandiasmaduras', 'melonesamarillos', 'cajademelocotones', 'cestosdecerezas', 'cestodeciruelas', 'cestasdelimones',
  'pinasmaduras', 'racimosdebanano', 'racimosdeplatano', 'cocosverdes',
  'canasdulces', 'sacosdegranosdecafe', 'mazorcasdecacao', 'manojosdealbahaca'
]);

export function getItemWarehouseCategory(nombre: string): WarehouseCategory | null {
  const n = normalize(nombre);
  if (!n) return null;
  if (MINERAL_ITEMS.has(n)) return 'mineral';
  if (MADERA_ITEMS.has(n)) return 'madera';
  if (COMIDA_ITEMS.has(n)) return 'comida';
  return null;
}

export const ITEM_POOLS: Record<ItemCategory, string[]> = {
  Armas: ['Espada Corta', 'Arco de Caza', 'Daga', 'Lanza', 'Maza', 'Hacha de Guerra'],
  Equipo: ['Túnica', 'Cota de Malla', 'Botas de Cuero', 'Guantes', 'Casco', 'Capa', 'Escudo'],
  'Consumibles Magicos': ['Poción de Vida', 'Poción de Maná', 'Elixir de Fuerza', 'Poción de Furia', 'Poción de Invisibilidad', 'Pergamino de Fuego', 'Pergamino de Frío'],
  'Consumibles Comunes': ['Venda', 'Antídoto', 'Tónico', 'Ungüento'],
  'Comida y Bebida': ['Pan', 'Carne Seca', 'Manzana', 'Queso', 'Pescado', 'Cerveza', 'Agua', 'Odre con Agua', 'Odre vacío', 'Raciones de Comida', 'Carne', 'Trigo'],
  'Recurso Refinado': ['Lingote de Hierro', 'Lingote de Cobre', 'Lingote de Oro', 'Lingote de Plata', 'Tablón de Madera', 'Tela Fina', 'Cuero Curtido'],
  'Recursos en Bruto': [
    'Madera', 'Tronco', 'Leña', 'Piedra', 'Mármol', 'Hierro', 'Hierba', 'Tela', 'Cuero',
    // Minerales de extracción
    'Mineral de Cobre', 'Mineral de Estaño', 'Mineral de Hierro', 'Mineral de Plata', 'Mineral de Oro', 'Mineral de Carbón',
    'Cobre', 'Estaño', 'Plata', 'Oro', 'Carbón',
    // Cosechas de cereales
    'Gavillas de Trigo', 'Mazorcas de Maíz', 'Costales de Arroz',
    // Cosechas de vegetales
    'Cajón de Tomates', 'Saco de Zanahorias', 'Sacos de Patatas', 'Cestas de Coliflor',
    'Sarta de Chiles', 'Cesta de Champiñones',
    // Cosechas de frutas
    'Cestas de Fresas', 'Canastos de Uva', 'Sandías Maduras', 'Melones Amarillos',
    'Caja de Melocotones', 'Cestos de Cerezas', 'Cesto de Ciruelas', 'Cestas de Limones',
    'Piñas Maduras', 'Racimos de Banano', 'Racimos de Plátano', 'Cocos Verdes',
    // Cosechas industriales
    'Balas de Algodón', 'Cañas Dulces', 'Cuencos de Caucho',
    'Sacos de Granos de Café', 'Mazorcas de Cacao',
    // Cosechas especiales
    'Manojos de Albahaca', 'Rosas Fragantes', 'Flores de Jazmín',
    // Compostaje
    'Residuo Vegetal', 'Fertilizante',
  ],
  Utiles: ['Hacha', 'Pico', 'Martillo', 'Cuchillo', 'Pala', 'Sierra'],
  Crias: ['Polluelo', 'Cordero', 'Ternero', 'Cerdito', 'Potrillo'],
  Documentos: ['Mapa Antiguo', 'Carta', 'Contrato', 'Diario', 'Plano'],
};

/**
 * Saciedad funcional escalable por herencia (autoridad del servidor).
 * Cómo crear un consumible nuevo que altere hambre/sed del player y los NPCs:
 *   1. Añade su nombre canónico a ITEM_POOLS['Comida y Bebida']
 *      (y un alias en ITEM_ALIASES si la consola usa forma corta).
 *   2. Añade UNA entrada aquí en CONSUMABLE_EFFECTS con hunger/thirst.
 *   3. (Solo si los NPC deben llevarlo encima) añade el ResourceType en
 *      prisma/schema.prisma + una línea en CATALOG_TO_RESOURCE + dotación
 *      en SettlementRepository.makeDefaultSurvivor.
 * Sin más cambios, lo heredan: player.useItem, Survivor.tryAutoConsumePersonal
 * (backend), Needs/Inventory del frontend y el texto de la UI.
 * Escala 0 = saciado, 100 = hambriento/sediento. 20% = 1h, 100% = 5h.
 */
export interface ConsumableEffect {
  /** Puntos que reduce el hambre. */
  hunger?: number;
  /** Puntos que reduce la sed. */
  thirst?: number;
  /** Item que aparece al consumirlo (ej: Odre con Agua -> Odre vacío). */
  emptiesTo?: string;
  /** Si true, no se puede consumir directamente (ej: envase vacío). */
  notUsable?: boolean;
  /** Mensaje al intentar usarlo si notUsable. */
  notUsableMessage?: string;
}

export const CONSUMABLE_EFFECTS: Record<string, ConsumableEffect> = {
  Pan: { hunger: 20 },
  'Carne Seca': { hunger: 30 },
  Manzana: { hunger: 15 },
  Queso: { hunger: 25 },
  Pescado: { hunger: 25 },
  Cerveza: { hunger: 10, thirst: 15 },
  Agua: { thirst: 30 },
  'Odre con Agua': { thirst: 20, emptiesTo: 'Odre vacío' },
  'Odre vacío': {
    notUsable: true,
    notUsableMessage:
      'El Odre vacío no se puede beber. Consigue un Odre con Agua (addItem:Bebida/OdreAgua1..9).',
  },
  'Raciones de Comida': { hunger: 40 },
  Carne: { hunger: 30 },
  Trigo: { hunger: 15 },
  // Cosechas de cereales
  'Gavillas de Trigo': { hunger: 20 },
  'Mazorcas de Maíz': { hunger: 25 },
  'Costales de Arroz': { hunger: 30 },
  // Cosechas de vegetales
  'Cajón de Tomates': { hunger: 15, thirst: 10 },
  'Saco de Zanahorias': { hunger: 15 },
  'Sacos de Patatas': { hunger: 25 },
  'Cestas de Coliflor': { hunger: 15 },
  'Sarta de Chiles': { hunger: 10 },
  'Cesta de Champiñones': { hunger: 15 },
  // Cosechas de frutas
  'Cestas de Fresas': { hunger: 15 },
  'Canastos de Uva': { hunger: 20 },
  'Sandías Maduras': { hunger: 20, thirst: 20 },
  'Melones Amarillos': { hunger: 15, thirst: 15 },
  'Caja de Melocotones': { hunger: 20 },
  'Cestos de Cerezas': { hunger: 15 },
  'Cesto de Ciruelas': { hunger: 15 },
  'Cestas de Limones': { hunger: 10 },
  'Piñas Maduras': { hunger: 20, thirst: 10 },
  'Racimos de Banano': { hunger: 20 },
  'Racimos de Plátano': { hunger: 20 },
  'Cocos Verdes': { hunger: 15, thirst: 15 },
  // Cosechas comestibles especiales/industriales
  'Cañas Dulces': { hunger: 15 },
  'Sacos de Granos de Café': { hunger: 10 },
  'Mazorcas de Cacao': { hunger: 10 },
  'Manojos de Albahaca': { hunger: 10 },
};

export interface ItemMeta {
  icono: string;
  descripcion: string;
}

export const ITEM_META: Record<string, ItemMeta> = {
  Pan: {
    icono: '🍞',
    descripcion: 'Sacia 20% de hambre. Úsalo desde el inventario.',
  },
  'Carne Seca': { icono: '🥩', descripcion: 'Sacia 30% de hambre.' },
  Manzana: { icono: '🍎', descripcion: 'Sacia 15% de hambre.' },
  Queso: { icono: '🧀', descripcion: 'Sacia 25% de hambre.' },
  Pescado: { icono: '🐟', descripcion: 'Sacia 25% de hambre.' },
  Cerveza: { icono: '🍺', descripcion: 'Sacia 10% de hambre y 15% de sed.' },
  Agua: { icono: '💧', descripcion: 'Sacia 30% de sed.' },
  'Odre con Agua': {
    icono: '💧',
    descripcion: 'Sacia 20% de sed. Al beber deja 1x Odre vacío.',
  },
  'Odre vacío': {
    icono: '🏺',
    descripcion: 'Odre vacío. Se obtiene al beber un Odre con Agua.',
  },
  'Raciones de Comida': { icono: '🍱', descripcion: 'Sacia 40% de hambre.' },
  Carne: { icono: '🍖', descripcion: 'Sacia 30% de hambre.' },
  Trigo: { icono: '🌾', descripcion: 'Sacia 15% de hambre.' },
  // Armas (daño base + cadencia + alcance + hemorragia)
  'Espada Corta': { icono: '🗡️', descripcion: 'Arma: +15 daño, +10 velocidad de ataque. Hemorragia +20/10s (máx 5 acumulaciones).' },
  'Arco de Caza': { icono: '🏹', descripcion: 'Arma: +10 daño, +10 tiles de alcance, -5 velocidad de ataque.' },
  Daga: { icono: '🔪', descripcion: 'Arma: +5 daño, +20 velocidad de ataque. Hemorragia +10/10s (máx 8).' },
  Lanza: { icono: '🔱', descripcion: 'Arma: +20 daño, +2 tiles de alcance. Hemorragia +30/50s (máx 3).' },
  Maza: { icono: '🔨', descripcion: 'Arma: +30 daño, -2 velocidad de ataque.' },
  'Hacha de Guerra': { icono: '🪓', descripcion: 'Arma: +20 daño. Hemorragia +30/10s (máx 10).' },
  // Equipo
  'Túnica': { icono: '🥋', descripcion: 'Vestimenta ligera sin atributos (por ahora).' },
  'Cota de Malla': { icono: '⛓️', descripcion: 'Armadura: +10% reducción de daño recibido.' },
  'Botas de Cuero': { icono: '🥾', descripcion: 'Calzado: +5% velocidad de movimiento.' },
  Guantes: { icono: '🧤', descripcion: 'Guantes: +5% velocidad de ataque.' },
  Casco: { icono: '🪖', descripcion: 'Yelmo: +5% reducción de daño recibido.' },
  Capa: { icono: '🧥', descripcion: 'Capa: +10% resistencia al fuego y al frío.' },
  Escudo: { icono: '🛡️', descripcion: 'Escudo: +20% defensa (reducción de daño recibido).' },
  // Consumibles mágicos
  'Poción de Vida': { icono: '❤️', descripcion: 'Recupera +50 puntos de vida al usarla.' },
  'Poción de Maná': { icono: '🔷', descripcion: 'Recupera +10 puntos de maná al usarla.' },
  'Elixir de Fuerza': { icono: '💪', descripcion: 'Aumenta +20 el daño base de forma permanente.' },
  'Poción de Furia': { icono: '😡', descripcion: '+30 daño base durante 30 segundos.' },
  'Poción de Invisibilidad': { icono: '👁️', descripcion: 'Invisible 10 segundos: indetectable para enemigos.' },
  'Pergamino de Fuego': { icono: '🔥', descripcion: 'Inflige +100 daño de fuego en 5 tiles + quemadura +100/10s.' },
  'Pergamino de Frío': { icono: '❄️', descripcion: 'Inflige +100 daño de frío en 5 tiles + daño de frío +100/10s y -20% velocidad de ataque/movimiento.' },
  // Consumibles comunes
  Venda: { icono: '🩹', descripcion: 'Recupera +30 de vida y purga la hemorragia.' },
  'Antídoto': { icono: '🧪', descripcion: 'Elimina todos los efectos negativos.' },
  'Tónico': { icono: '⚗️', descripcion: '+20% resistencia al fuego/frío e inmunidad a efectos negativos por 1 minuto.' },
  'Ungüento': { icono: '🧴', descripcion: 'Inmunidad a quemaduras y +100 de vida durante 1 minuto.' },
  // Refinados y brutos nuevos
  'Lingote de Cobre': { icono: '🟧', descripcion: 'Metal refinado para manufactura.' },
  'Lingote de Oro': { icono: '🟨', descripcion: 'Metal precioso refinado.' },
  'Lingote de Plata': { icono: '⬜', descripcion: 'Metal refinado para manufactura.' },
  'Mármol': { icono: '⬜', descripcion: 'Piedra noble para construcción.' },
  Tronco: { icono: '🪵', descripcion: 'Tronco en bruto para aserrar.' },
  'Leña': { icono: '🔥', descripcion: 'Madera menuda como combustible.' },
  // Compostaje (del Compostador: 1 Residuo Vegetal → 1 Fertilizante en 60s con granjero)
  'Residuo Vegetal': { icono: '🍂', descripcion: 'Resto vegetal de cosechas (1-3 por cosecha). Procésalo en un Compostador para fabricar fertilizante.' },
  'Fertilizante': { icono: '💩', descripcion: 'Abono orgánico producido en el Compostador a partir de residuos vegetales.' },
};

export function getItemMeta(nombre: string): ItemMeta | null {
  const entry = findCatalogEntry(nombre);
  if (!entry) return null;
  return ITEM_META[entry.nombre] ?? null;
}

/**
 * Efecto heredable de un item por nombre (alias incluidos).
 * Retorna null si el item no altera saciedad.
 */
export function getConsumableEffect(
  nombre: string,
): { nombre: string; categoria: ItemCategory; effect: ConsumableEffect } | null {
  const entry = findCatalogEntry(nombre);
  if (!entry) return null;
  const effect = CONSUMABLE_EFFECTS[entry.nombre];
  if (!effect) return null;
  return { nombre: entry.nombre, categoria: entry.categoria, effect };
}

/** Texto del efecto para consola/UI, derivado del registro (ej: "+20% saciedad de hambre"). */
export function describeEffect(effect: ConsumableEffect, emptiesResolved?: string | null): string {
  const parts: string[] = [];
  if (effect.hunger && effect.hunger > 0) parts.push(`+${effect.hunger}% saciedad de hambre`);
  if (effect.thirst && effect.thirst > 0) parts.push(`+${effect.thirst}% saciedad de sed`);
  let msg = parts.join(', ') || 'sin efecto';
  if (effect.emptiesTo) msg += ` (+1 ${emptiesResolved ?? effect.emptiesTo})`;
  return msg;
}

/**
 * Puente item de catálogo (inventario del player) <-> ResourceType
 * (inventario personal de NPCs). Los NPC auto-consumen por este mapa.
 */
export const CATALOG_TO_RESOURCE: Record<string, string> = {
  Pan: 'PAN',
  'Odre con Agua': 'ODRE_AGUA',
  'Odre vacío': 'ODRE_VACIO',
};

const RESOURCE_TO_CATALOG: Record<string, string> = Object.fromEntries(
  Object.entries(CATALOG_TO_RESOURCE).map(([catalog, resource]) => [resource, catalog]),
);

export function resourceTypeForCatalog(nombre: string): string | null {
  const entry = findCatalogEntry(nombre);
  if (!entry) return null;
  return CATALOG_TO_RESOURCE[entry.nombre] ?? null;
}

export function catalogForResourceType(resourceType: string): string | null {
  if (!resourceType) return null;
  return RESOURCE_TO_CATALOG[String(resourceType).toUpperCase()] ?? null;
}

/**
 * Alias de consola (sin tildes/espacios) -> nombre canónico del catálogo.
 * Ej: "OdreAgua" (addItem:Bebida/OdreAgua3) -> "Odre con Agua".
 * normalize() ya quita tildes/espacios, así que solo mapeamos los que
 * pierden palabras ("con") o usan forma corta.
 */
const ITEM_ALIASES: Record<string, string> = {
  odreagua: 'Odre con Agua',
  odreedeagua: 'Odre con Agua',
  odreconagua: 'Odre con Agua',
  odre: 'Odre vacío',
  odrevacio: 'Odre vacío',
  pan: 'Pan',
  racionesdecomida: 'Raciones de Comida',
  // Variantes de madera -> canónicos del catálogo
  tronco: 'Tronco',
  troncos: 'Tronco',
  lena: 'Leña',
  tablas: 'Tablón de Madera',
  tablon: 'Tablón de Madera',
  tablones: 'Tablón de Madera',
  tablondemadera: 'Tablón de Madera',
  // Pergamino de frío (no es pergamino de escuela: va por nombre, no por escuela)
  pergaminodefrio: 'Pergamino de Frío',
  pergaminodehielo: 'Pergamino de Frío',
};

export const TRAINING_SCROLL_NAMES: Record<SchoolId, string> = {
  supervivencia: 'Pergamino de Entrenamiento: Supervivencia',
  produccion: 'Pergamino de Entrenamiento: Producción',
  politica: 'Pergamino de Entrenamiento: Política',
  milicia: 'Pergamino de Entrenamiento: Milicia',
  ciencias: 'Pergamino de Entrenamiento: Ciencias',
  artes_misticas: 'Pergamino de Entrenamiento: Artes Místicas',
};

const SCROLL_BY_NAME: Record<string, SchoolId> = Object.fromEntries(
  Object.entries(TRAINING_SCROLL_NAMES).map(([school, name]) => [name, school as SchoolId]),
);

export function scrollSchoolFromName(nombre: string): SchoolId | null {
  return SCROLL_BY_NAME[nombre] ?? null;
}

export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

export function parseSchool(alias: string): SchoolId | null {
  switch (normalize(alias)) {
    case 'supervivencia':
    case 'survival':
      return 'supervivencia';
    case 'produccion':
    case 'production':
      return 'produccion';
    case 'politica':
    case 'politics':
    case 'politic':
      return 'politica';
    case 'milicia':
    case 'militia':
    case 'military':
      return 'milicia';
    case 'ciencias':
    case 'ciencia':
    case 'science':
    case 'sciences':
      return 'ciencias';
    case 'artesmisticas':
    case 'artes':
    case 'misticas':
    case 'mystic':
    case 'mystics':
    case 'mysticarts':
    case 'magic':
      return 'artes_misticas';
    default:
      return null;
  }
}

export function findCatalogEntry(nombre: string): { nombre: string; categoria: ItemCategory } | null {
  const n = normalize(nombre);
  if (!n) return null;
  const alias = ITEM_ALIASES[n];
  const target = alias ? normalize(alias) : n;
  for (const categoria of Object.keys(ITEM_POOLS) as ItemCategory[]) {
    const found = ITEM_POOLS[categoria].find((pool) => normalize(pool) === target);
    if (found) return { nombre: found, categoria };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// STATS DE COMBATE (autoridad del servidor)
// El frontend los espeja en src/items/ItemStats.ts (solo display/cadencia
// local); el servidor valida nombres contra este registro y decide daño,
// efectos y duraciones.
// ═══════════════════════════════════════════════════════════════════

/** 1 tile = 32px en mundo iso (para convertir alcance de armas a px). */
export const TILE_PX = 32;

/** Ventana base de cadencia: sin arma, 1 golpe cada 3 segundos. */
export const BASE_ATTACK_WINDOW_MS = 3000;

/**
 * Suelo de cadencia: 0.5 golpes por ventana = 1 golpe cada 6 segundos.
 * Cualquier bonus total <= -3 (o que deje los golpes en <= 0.5) cae aquí.
 */
export const MIN_ATTACK_HITS_PER_WINDOW = 0.5;

/**
 * Convierte el bonus plano de velocidad de ataque a intervalo entre golpes.
 * El bonus modifica los golpes por ventana de 3s: golpes = 1 + bonus.
 * Ej: Espada Corta (+10) -> 11 golpes/3s -> ~273ms; Maza (-2) -> suelo 6s.
 */
export function getAttackIntervalMs(attackSpeedBonus: number): number {
  const bonus = Number.isFinite(attackSpeedBonus) ? attackSpeedBonus : 0;
  if (bonus < -3) return Math.round(BASE_ATTACK_WINDOW_MS / MIN_ATTACK_HITS_PER_WINDOW);
  const hits = 1 + bonus;
  if (hits <= MIN_ATTACK_HITS_PER_WINDOW) {
    return Math.round(BASE_ATTACK_WINDOW_MS / MIN_ATTACK_HITS_PER_WINDOW);
  }
  return Math.max(1, Math.round(BASE_ATTACK_WINDOW_MS / hits));
}

/** Hemorragia de un arma: el daño se acumula por cantidad (suma), la
 * duración NO se acumula (se reinicia en cada aplicación), y el daño por
 * tick de la hemorragia es el total acumulado. */
export interface BleedSpec {
  damage: number;
  durationSec: number;
  maxStacks: number;
}

export interface WeaponStats {
  /** Daño base por golpe. */
  damage: number;
  /** Bonus plano de velocidad: golpes extra por ventana de 3s (puede ser negativo). */
  attackSpeed: number;
  /** Alcance extra en tiles (se suma al alcance base del atacante). */
  rangeTiles?: number;
  bleed?: BleedSpec;
}

export const WEAPON_STATS: Record<string, WeaponStats> = {
  'Espada Corta': { damage: 15, attackSpeed: 10, bleed: { damage: 20, durationSec: 10, maxStacks: 5 } },
  'Arco de Caza': { damage: 10, attackSpeed: -5, rangeTiles: 10 },
  Daga: { damage: 5, attackSpeed: 20, bleed: { damage: 10, durationSec: 10, maxStacks: 8 } },
  Lanza: { damage: 20, attackSpeed: 0, rangeTiles: 2, bleed: { damage: 30, durationSec: 50, maxStacks: 3 } },
  Maza: { damage: 30, attackSpeed: -2 },
  'Hacha de Guerra': { damage: 20, attackSpeed: 0, bleed: { damage: 30, durationSec: 10, maxStacks: 10 } },
};

export const WEAPON_NAMES = Object.keys(WEAPON_STATS);

/** Stats por nombre canónico de arma (alias incluidos). Null si no es arma. */
export function getWeaponStats(nombre: string): (WeaponStats & { nombre: string }) | null {
  const entry = findCatalogEntry(nombre);
  if (!entry || entry.categoria !== 'Armas') return null;
  const stats = WEAPON_STATS[entry.nombre];
  return stats ? { ...stats, nombre: entry.nombre } : null;
}

export interface EquipmentStats {
  /** Fracción 0..1 de daño directo recibido que se ignora. */
  damageReduction?: number;
  /** Fracción (ej 0.05 = +5%) de velocidad de movimiento. */
  moveSpeedPct?: number;
  /** Fracción (ej 0.05 = +5%) que acelera la cadencia (multiplica golpes). */
  attackSpeedPct?: number;
  /** Fracción 0..1 de daño de fuego/daño por quemadura que se ignora. */
  fireResist?: number;
  /** Fracción 0..1 de daño de frío que se ignora. */
  coldResist?: number;
}

export const EQUIPMENT_STATS: Record<string, EquipmentStats> = {
  // Túnica: sin atributos por ahora.
  'Túnica': {},
  'Cota de Malla': { damageReduction: 0.1 },
  'Botas de Cuero': { moveSpeedPct: 0.05 },
  Guantes: { attackSpeedPct: 0.05 },
  Casco: { damageReduction: 0.05 },
  Capa: { fireResist: 0.1, coldResist: 0.1 },
  Escudo: { damageReduction: 0.2 },
};

export const ARMOR_NAMES = Object.keys(EQUIPMENT_STATS);

// ═══════════════════════════════════════════════════════════════════
// CALIDAD DE ARMAS Y EQUIPO (autoridad del servidor)
// Solo Armas y Equipo pueden tener calidad. `comun` es el valor base
// (multiplicador 1.0) para no alterar los números del catálogo.
// ═══════════════════════════════════════════════════════════════════

export type ItemQuality =
  | 'comun' | 'bueno' | 'raro' | 'notable' | 'sobresaliente'
  | 'excelente' | 'obra maestra' | 'legendario' | 'dios';

export const QUALITY_BONUSES: Record<ItemQuality, number> = {
  comun: 0,
  bueno: 5,
  raro: 10,
  notable: 15,
  sobresaliente: 20,
  excelente: 20,
  'obra maestra': 30,
  legendario: 50,
  dios: 100,
};

/** Bonus plano de calidad que se SUMA al valor base (comun = 0, no altera el catálogo). */
export function getQualityBonus(quality?: string | null): number {
  const q = (quality ?? 'comun').toLowerCase() as ItemQuality;
  return QUALITY_BONUSES[q] ?? 0;
}

/** Durabilidad máxima al crear el item según su calidad (comun = 100). */
export function maxDurabilityForQuality(quality?: string | null): number {
  return 100 + getQualityBonus(quality);
}

/** Stats de arma con la calidad aplicada (daño y sangrado suman el bonus; cadencia/alcance no). */
export function applyQualityToWeaponStats<T extends WeaponStats>(
  stats: T, quality?: string | null,
): T {
  const bonus = getQualityBonus(quality);
  if (bonus === 0) return { ...stats };
  return {
    ...stats,
    damage: stats.damage + bonus,
    ...(stats.bleed ? { bleed: { ...stats.bleed, damage: stats.bleed.damage + bonus } } : {}),
  };
}

/** Stats de equipo con la calidad aplicada (el bonus suma puntos porcentuales). */
export function applyQualityToEquipmentStats<T extends EquipmentStats>(
  stats: T, quality?: string | null,
): T {
  const bonus = getQualityBonus(quality);
  if (bonus === 0) return { ...stats };
  const scale = (v: number) => Math.round((v + bonus / 100) * 10000) / 10000;
  return {
    ...stats,
    ...(typeof stats.damageReduction === 'number' ? { damageReduction: scale(stats.damageReduction) } : {}),
    ...(typeof stats.moveSpeedPct === 'number' ? { moveSpeedPct: scale(stats.moveSpeedPct) } : {}),
    ...(typeof stats.attackSpeedPct === 'number' ? { attackSpeedPct: scale(stats.attackSpeedPct) } : {}),
    ...(typeof stats.fireResist === 'number' ? { fireResist: scale(stats.fireResist) } : {}),
    ...(typeof stats.coldResist === 'number' ? { coldResist: scale(stats.coldResist) } : {}),
  };
}

/** Stats por nombre canónico de equipo (alias incluidos). Null si no es equipo. */
export function getEquipmentStats(nombre: string): (EquipmentStats & { nombre: string }) | null {
  const entry = findCatalogEntry(nombre);
  if (!entry || entry.categoria !== 'Equipo') return null;
  const stats = EQUIPMENT_STATS[entry.nombre];
  return stats ? { ...stats, nombre: entry.nombre } : null;
}

/** Daño en el tiempo de un pergamino de área. */
export interface ScrollDotSpec {
  /** Daño total repartido en la duración (tick cada 1s). */
  damage: number;
  durationSec: number;
  /** 'quemadura' (fuego) o 'frio' (daño de frío + ralentización). */
  kind: 'quemadura' | 'frio';
}

/** Efecto de combate al USAR un consumible (Pociones, Elixir, Vendas...). */
export interface ConsumableCombat {
  heal?: number;
  mana?: number;
  /** Elixir de Fuerza: +daño base permanente. */
  damageBuff?: number;
  /** Poción de Furia: +daño base temporal (no permanente). */
  damageBoost?: { bonus: number; secs: number };
  /** Poción de Invisibilidad: indetectable para enemigos durante N segundos. */
  invisibleSec?: number;
  /** Venda: purga solo hemorragia. Antídoto: purga todo. */
  cleanseBleed?: boolean;
  cleanseAll?: boolean;
  /** Tónico: resistencia al fuego/frío durante N segundos. */
  resistFire?: number;
  resistCold?: number;
  resistDurationSec?: number;
  /** Tónico: inmunidad a efectos negativos durante N segundos. */
  immuneNegativeSec?: number;
  /** Ungüento: inmunidad a quemaduras durante N segundos. */
  immuneBurn?: boolean;
  immuneBurnSec?: number;
  /** Ungüento: curación repartida en la duración (tick cada 1s). */
  healOverTime?: { total: number; durationSec: number };
  /** Pergaminos de área: daño + radio en tiles + DoT a los afectados. */
  aoe?: {
    damage: number;
    radiusTiles: number;
    dot: ScrollDotSpec;
    /** Solo Pergamino de Frío: -20% ataque/movimiento a los afectados. */
    slow?: { attackSpeedPct: number; moveSpeedPct: number; durationSec: number };
  };
}

export const CONSUMABLE_COMBAT: Record<string, ConsumableCombat> = {
  'Poción de Vida': { heal: 50 },
  'Poción de Maná': { mana: 10 },
  'Elixir de Fuerza': { damageBuff: 20 },
  'Poción de Furia': { damageBoost: { bonus: 30, secs: 30 } },
  'Poción de Invisibilidad': { invisibleSec: 10 },
  'Pergamino de Fuego': {
    aoe: { damage: 100, radiusTiles: 5, dot: { damage: 100, durationSec: 10, kind: 'quemadura' } },
  },
  'Pergamino de Frío': {
    aoe: {
      damage: 100,
      radiusTiles: 5,
      dot: { damage: 100, durationSec: 10, kind: 'frio' },
      slow: { attackSpeedPct: -0.2, moveSpeedPct: -0.2, durationSec: 10 },
    },
  },
  Venda: { heal: 30, cleanseBleed: true },
  'Antídoto': { cleanseAll: true },
  'Tónico': { resistFire: 0.2, resistCold: 0.2, resistDurationSec: 60, immuneNegativeSec: 60 },
  'Ungüento': { immuneBurn: true, immuneBurnSec: 60, healOverTime: { total: 100, durationSec: 60 } },
};

/** Efecto de combate por nombre canónico (alias incluidos). Null si no tiene. */
export function getConsumableCombat(nombre: string): (ConsumableCombat & { nombre: string }) | null {
  const entry = findCatalogEntry(nombre);
  if (!entry) return null;
  const combat = CONSUMABLE_COMBAT[entry.nombre];
  return combat ? { ...combat, nombre: entry.nombre } : null;
}

/** Buffs temporizados persistidos en Player.settings.game.buffs. */
export type TimedBuffKind =
  | 'resist_fire'
  | 'resist_cold'
  | 'immune_negative'
  | 'immune_burn'
  | 'hot'
  | 'attack_slow'
  | 'move_slow'
  | 'damage_boost'
  | 'invisible';

export interface TimedBuff {
  kind: TimedBuffKind;
  /** Magnitud (fracción para resists/slows, PV por tick para hot). */
  value: number;
  /** Epoch ms de expiración. */
  expiresAt: number;
}

// ═══════════════════════════════════════════════════════════════════
// ENGARCES DE EQUIPO (autoridad del servidor)
// Cada pieza de Armas/Equipo tiene slots de mejora: 3 de encantamiento,
// 2 de runa y 1 de gema. Por ahora los slots existen como modelo + UI
// (vacíos); engarzar piezas será una acción futura.
// ═══════════════════════════════════════════════════════════════════

/** Nombres engarzados por categoría en una pieza de equipo. */
export interface EquipmentSockets {
  encantamientos: string[];
  runas: string[];
  gemas: string[];
}

/** Capacidad de engarces por pieza de equipo. */
export const SOCKET_CAPACITY: Record<keyof EquipmentSockets, number> = {
  encantamientos: 3,
  runas: 2,
  gemas: 1,
};

export function emptySockets(): EquipmentSockets {
  return { encantamientos: [], runas: [], gemas: [] };
}

/** Valida y sanea engarces leídos de persistencia (nombres no vacíos, con tope). */
export function sanitizeSockets(raw: unknown): EquipmentSockets {
  const out = emptySockets();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  (Object.keys(SOCKET_CAPACITY) as (keyof EquipmentSockets)[]).forEach((k) => {
    const v = o[k];
    if (!Array.isArray(v)) return;
    out[k] = v
      .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      .slice(0, SOCKET_CAPACITY[k])
      .map((e) => e.slice(0, 60));
  });
  return out;
}
