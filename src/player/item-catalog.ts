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
export const MAX_STACK = 10;

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

export const ITEM_POOLS: Record<ItemCategory, string[]> = {
  Armas: ['Espada Corta', 'Arco de Caza', 'Daga', 'Lanza', 'Maza', 'Hacha de Guerra'],
  Equipo: ['Túnica', 'Cota de Malla', 'Botas de Cuero', 'Guantes', 'Casco', 'Capa'],
  'Consumibles Magicos': ['Poción de Vida', 'Poción de Maná', 'Elixir de Fuerza', 'Pergamino de Fuego'],
  'Consumibles Comunes': ['Venda', 'Antídoto', 'Tónico', 'Ungüento'],
  'Comida y Bebida': ['Pan', 'Carne Seca', 'Manzana', 'Queso', 'Pescado', 'Cerveza', 'Agua', 'Odre con Agua', 'Odre vacío'],
  'Recurso Refinado': ['Lingote de Hierro', 'Tablón de Madera', 'Tela Fina', 'Cuero Curtido'],
  'Recursos en Bruto': ['Madera', 'Piedra', 'Hierro', 'Hierba', 'Tela', 'Cuero'],
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
  'Odre con Agua': { thirst: 20, emptiesTo: 'Odre vacío' },
  'Odre vacío': {
    notUsable: true,
    notUsableMessage:
      'El Odre vacío no se puede beber. Consigue un Odre con Agua (addItem:Bebida/OdreAgua1..9).',
  },
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
  'Odre con Agua': {
    icono: '💧',
    descripcion: 'Sacia 20% de sed. Al beber deja 1x Odre vacío.',
  },
  'Odre vacío': {
    icono: '🏺',
    descripcion: 'Odre vacío. Se obtiene al beber un Odre con Agua.',
  },
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
