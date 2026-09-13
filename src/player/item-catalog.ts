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
  'Comida y Bebida': ['Pan', 'Carne Seca', 'Manzana', 'Queso', 'Pescado', 'Cerveza', 'Agua'],
  'Recurso Refinado': ['Lingote de Hierro', 'Tablón de Madera', 'Tela Fina', 'Cuero Curtido'],
  'Recursos en Bruto': ['Madera', 'Piedra', 'Hierro', 'Hierba', 'Tela', 'Cuero'],
  Utiles: ['Hacha', 'Pico', 'Martillo', 'Cuchillo', 'Pala', 'Sierra'],
  Crias: ['Polluelo', 'Cordero', 'Ternero', 'Cerdito', 'Potrillo'],
  Documentos: ['Mapa Antiguo', 'Carta', 'Contrato', 'Diario', 'Plano'],
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
  for (const categoria of Object.keys(ITEM_POOLS) as ItemCategory[]) {
    const found = ITEM_POOLS[categoria].find((pool) => normalize(pool) === n);
    if (found) return { nombre: found, categoria };
  }
  return null;
}
