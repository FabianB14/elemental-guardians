import type { Element, TerrainCardDef, TerrainCardId, TerrainType } from './types';

export const TERRAIN_TYPES: readonly TerrainType[] = [
  'plains',
  'volcanic',
  'tide',
  'gale',
  'stone',
  'blighted',
];

/**
 * Stat modifiers a tile grants to the unit standing on it.
 * `byElement` keys are guardian elements; evil units use element 'shadow' and
 * are therefore unaffected by the element clauses.
 * `allGuardianTroops` applies to every non-god guardian unit (Blighted).
 * MOV penalties are floored at 1 by CONFIG (see engine/stats.ts) and are
 * ignored entirely by Flying units.
 */
export interface TerrainModifier {
  byElement?: Partial<Record<Element, { atk?: number; def?: number; mov?: number }>>;
  allGuardianTroops?: { atk?: number; def?: number; mov?: number };
}

export const TERRAIN_MODIFIERS: Record<TerrainType, TerrainModifier> = {
  plains: {},
  volcanic: { byElement: { fire: { atk: 1 }, water: { atk: -1 } } },
  tide: { byElement: { water: { atk: 1 }, fire: { atk: -1 } } },
  gale: { byElement: { wind: { mov: 1 }, earth: { mov: -1 } } },
  stone: { byElement: { earth: { def: 1 }, wind: { atk: -1 } } },
  blighted: { allGuardianTroops: { def: -1 } },
};

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  plains: '#4a5b3c',
  volcanic: '#7a2f22',
  tide: '#1f4e73',
  gale: '#3f6b63',
  stone: '#5c5347',
  blighted: '#3a2a44',
};

export const TERRAIN_CARDS: Record<TerrainCardId, TerrainCardDef> = {
  volcanicSurge: {
    id: 'volcanicSurge',
    name: 'Volcanic Surge',
    text: 'A 3x3 area becomes Volcanic.',
  },
  risingTide: {
    id: 'risingTide',
    name: 'Rising Tide',
    text: 'Every tile adjacent to Tide becomes Tide. If there is no Tide, seed a 2x2 patch.',
  },
  galeFront: { id: 'galeFront', name: 'Gale Front', text: 'A 3x3 area becomes Gale.' },
  tectonicShift: {
    id: 'tectonicShift',
    name: 'Tectonic Shift',
    text: 'A 2x2 area becomes Stone. Non-Earth units there take 1 damage.',
  },
  withering: {
    id: 'withering',
    name: 'Withering',
    text: 'A 2x2 area nearest the guardians becomes Blighted.',
  },
  stillness: { id: 'stillness', name: 'Stillness', text: 'All Blighted tiles become Plains.' },
};

/** The 20-card terrain deck, as an unshuffled list. Reshuffles when empty. */
export const TERRAIN_DECK_LIST: TerrainCardId[] = [
  ...Array<TerrainCardId>(4).fill('volcanicSurge'),
  ...Array<TerrainCardId>(4).fill('risingTide'),
  ...Array<TerrainCardId>(4).fill('galeFront'),
  ...Array<TerrainCardId>(4).fill('tectonicShift'),
  ...Array<TerrainCardId>(2).fill('withering'),
  ...Array<TerrainCardId>(2).fill('stillness'),
];
