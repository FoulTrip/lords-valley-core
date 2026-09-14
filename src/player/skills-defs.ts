import type { SchoolId } from './item-catalog';

/** Nivel máximo de habilidad (FullMode lo otorga a las 48). */
export const MAX_SKILL_LEVEL = 100;

export const SKILL_IDS: Record<SchoolId, string[]> = {
  supervivencia: [
    'sup_rastreo',
    'sup_caza',
    'sup_pesca',
    'sup_herbolaria',
    'sup_fogatas',
    'sup_orientacion',
    'sup_resistencia',
    'sup_tramperia',
  ],
  produccion: [
    'prod_agricultura',
    'prod_carpinteria',
    'prod_herreria',
    'prod_canteria',
    'prod_curtiduria',
    'prod_alquimia',
    'prod_textil',
    'prod_cocina',
  ],
  politica: [
    'pol_liderazgo',
    'pol_diplomacia',
    'pol_administracion',
    'pol_justicia',
    'pol_comercio',
    'pol_oratoria',
    'pol_intriga',
    'pol_legitimidad',
  ],
  milicia: [
    'mil_combate',
    'mil_arqueria',
    'mil_defensa',
    'mil_tactica',
    'mil_caballeria',
    'mil_asedio',
    'mil_supervivencia_mil',
    'mil_logistica',
  ],
  ciencias: [
    'cie_medicina',
    'cie_ingenieria',
    'cie_astronomia',
    'cie_alquimia_t',
    'cie_matematicas',
    'cie_historia',
    'cie_navegacion',
    'cie_invencion',
  ],
  artes_misticas: [
    'mis_ritualismo',
    'mis_adivinacion',
    'mis_encantamiento',
    'mis_nigromancia',
    'mis_elementalismo',
    'mis_ilusionismo',
    'mis_sanacion',
    'mis_pacto',
  ],
};
