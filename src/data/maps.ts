import type { TerrainType } from './types';

/**
 * Maps are authored as 11 rows of 11 characters. Row 0 is the top edge
 * (evil shrines); row 10 is the bottom edge (guardian spawns).
 *
 *   . plains    V volcanic   T tide
 *   G gale      S stone      B blighted
 */
export const TERRAIN_CHARS: Record<string, TerrainType> = {
  '.': 'plains',
  V: 'volcanic',
  T: 'tide',
  G: 'gale',
  S: 'stone',
  B: 'blighted',
};

export const DEFAULT_MAP: readonly string[] = [
  '...........',
  '..V.....G..',
  '.VV.....GG.',
  '...........',
  '....SS.....',
  '...SSS.....',
  '....S......',
  '...........',
  '.TT.....V..',
  '..T........',
  '...........',
];

/**
 * Seeded generation: this many patches of each listed terrain are stamped onto
 * an otherwise-Plains board, never on the top or bottom two rows (spawn zones).
 */
export const MAP_GEN = {
  patchTerrains: ['volcanic', 'tide', 'gale', 'stone'] as TerrainType[],
  patchesPerTerrain: 2,
  patchRadius: 1,
  /** Rows kept clear of generated terrain at each edge. */
  spawnBuffer: 2,
} as const;
