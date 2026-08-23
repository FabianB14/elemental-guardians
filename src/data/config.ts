import type { Difficulty, Element } from './types';

/** Global tunables. Every number the rules reference lives here or beside it. */
export const CONFIG = {
  boardWidth: 11,
  boardHeight: 11,

  openingHandSize: 5,
  drawPerRound: 2,
  handLimit: 8,

  deckSize: 30,
  /** Copies of each of a guardian's five troop types. */
  troopCopies: 4,
  /** Split of the 7 element power cards across the guardian's two power types. */
  powerSplit: [4, 3] as const,
  prismCopies: 2,

  /** Summon placement: empty tile within this many tiles of your god ... */
  summonRangeFromGod: 2,
  /** ... or adjacent to your General. */
  summonRangeFromGeneral: 1,

  /** Combo centre must be within this many tiles of a contributing god. */
  comboRange: 5,

  /** Terrain deck reshuffles when empty; no escalation attached. */
  terrainDeckSize: 20,
  doomDeckSize: 40,

  /** Doom cards revealed each Evil Phase = guardianCount + this. */
  doomCardsPerRound: { normal: 1, hard: 2 } satisfies Record<Difficulty, number>,

  /** Every Doom deck reshuffle grants evil units this much permanent ATK. */
  corruptionRisingAtk: 1,
  /** The Awakening doom card grants this much permanent ATK. */
  awakeningAtk: 1,

  /** Hard safety valve so a stalled autoplay sim always terminates. */
  maxRounds: 60,
} as const;

export const GOD_STATS = {
  guardian: { hp: 20, atk: 3, def: 3, mov: 1 },
  evil: { hp: 20, atk: 4, def: 3, mov: 0 },
} as const;

export const ELEMENTS: readonly Element[] = ['fire', 'water', 'wind', 'earth'];

/** Display colours for placeholder art. */
export const ELEMENT_COLORS: Record<Element | 'shadow', string> = {
  fire: '#e2542c',
  water: '#2f8fd8',
  wind: '#7fc8a9',
  earth: '#b8813f',
  shadow: '#6b3fa0',
};

export const GUARDIAN_NAMES: Record<Element, string> = {
  fire: 'Solren',
  water: 'Maren',
  wind: 'Zephyra',
  earth: 'Terron',
};

export const EVIL_NAMES: Record<Element, string> = {
  fire: 'Cindral',
  water: 'Vorath',
  wind: 'Skorne',
  earth: 'Gravalon',
};

/**
 * Column positions along the board edge for N gods, spread evenly.
 * Guardians use the bottom row, Evil Gods the top row (their shrines).
 */
export const SPAWN_COLUMNS: Record<number, readonly number[]> = {
  1: [5],
  2: [3, 7],
  3: [2, 5, 8],
  4: [1, 4, 6, 9],
};
