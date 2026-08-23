import {
  CONFIG,
  DEFAULT_MAP,
  DOOM_DECK_LIST,
  EVIL_NAMES,
  GUARDIAN_NAMES,
  MAP_GEN,
  SPAWN_COLUMNS,
  TERRAIN_CHARS,
  TERRAIN_DECK_LIST,
  unitDef,
} from '../data';
import type { Coord, Difficulty, Element, TerrainType } from '../data/types';
import { blockTiles, idx, inBounds } from './board';
import { buildDeck, dealOpeningHand } from './cards';
import { Rng, seedFromString } from './rng';
import type { GameState, GuardianState, Tile, Unit } from './types';

export interface SetupOptions {
  guardians: Element[];
  difficulty?: Difficulty;
  /** Numeric seed, or any string (hashed). Omit for a fixed default. */
  seed?: number | string;
  /** 'default' uses the authored map; 'random' generates a seeded one. */
  map?: 'default' | 'random';
}

function makeTiles(width: number, height: number): Tile[] {
  return Array.from({ length: width * height }, () => ({
    terrain: 'plains' as TerrainType,
    blockedUntilRound: -1,
    shrine: false,
  }));
}

function applyDefaultMap(tiles: Tile[], width: number): void {
  DEFAULT_MAP.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const terrain = TERRAIN_CHARS[row[x]!];
      if (terrain) tiles[y * width + x]!.terrain = terrain;
    }
  });
}

function generateMap(tiles: Tile[], width: number, height: number, rng: Rng): void {
  const fake = { width, height } as GameState;
  for (const terrain of MAP_GEN.patchTerrains) {
    for (let i = 0; i < MAP_GEN.patchesPerTerrain; i++) {
      const cx = rng.int(width);
      const cy = MAP_GEN.spawnBuffer + rng.int(height - MAP_GEN.spawnBuffer * 2);
      const size = MAP_GEN.patchRadius * 2;
      for (const pos of blockTiles(fake, { x: cx, y: cy }, size)) {
        if (!inBounds(fake, pos)) continue;
        if (pos.y < MAP_GEN.spawnBuffer || pos.y >= height - MAP_GEN.spawnBuffer) continue;
        tiles[pos.y * width + pos.x]!.terrain = terrain;
      }
    }
  }
}

function makeUnit(
  state: GameState,
  defId: string,
  pos: Coord,
  owner: Element | null,
): Unit {
  const def = unitDef(defId);
  const unit: Unit = {
    id: state.nextUnitId++,
    defId,
    faction: def.faction,
    element: def.element,
    owner,
    pos: { ...pos },
    hp: def.hp,
    maxHp: def.hp,
    isGod: def.isGod ?? false,
    isGeneral: def.isGeneral ?? false,
    statuses: [],
    permAtk: 0,
    permDef: 0,
    tilesMovedThisTurn: 0,
    attacksUsed: 0,
    ultimateUsed: false,
    spawnOrder: state.nextSpawnOrder++,
  };
  state.units.push(unit);
  return unit;
}

/** Spawns a unit into the live game. Used by summons and the Doom deck. */
export function spawnUnit(
  state: GameState,
  defId: string,
  pos: Coord,
  owner: Element | null,
): Unit {
  return makeUnit(state, defId, pos, owner);
}

/**
 * Builds a fresh, fully-dealt game sitting in Round 1's Summon Phase.
 * Round 1's Draw Phase has already been resolved (each guardian drew 2 on top
 * of their opening hand of 5) — see DECISIONS.md.
 */
export function createGame(options: SetupOptions): GameState {
  const guardianElements = [...options.guardians];
  if (guardianElements.length < 1 || guardianElements.length > 4) {
    throw new Error('Pick between 1 and 4 guardians.');
  }
  const seed =
    typeof options.seed === 'string'
      ? seedFromString(options.seed)
      : (options.seed ?? 0x5eed1234);
  const rng = new Rng(seed);

  const width = CONFIG.boardWidth;
  const height = CONFIG.boardHeight;
  const tiles = makeTiles(width, height);
  if (options.map === 'random') generateMap(tiles, width, height, rng);
  else applyDefaultMap(tiles, width);

  const state: GameState = {
    seed,
    rngState: rng.state,
    difficulty: options.difficulty ?? 'normal',
    round: 1,
    phase: 'summon',
    width,
    height,
    tiles,
    units: [],
    guardians: [],
    guardianOrder: guardianElements,
    evilGodIds: [],
    evilSpawnCursor: 0,
    evilAtkBonus: 0,
    doomDeck: rng.shuffle([...DOOM_DECK_LIST]),
    doomDiscard: [],
    doomReshuffles: 0,
    terrainDeck: rng.shuffle([...TERRAIN_DECK_LIST]),
    terrainDiscard: [],
    combosUsedThisRound: [],
    nextUnitId: 1,
    nextSpawnOrder: 1,
    result: 'ongoing',
    stats: {
      rounds: 1,
      guardianKills: 0,
      guardianLosses: 0,
      doomCardsResolved: 0,
      combosPlayed: 0,
      cardsLeft: 0,
    },
  };

  const columns = SPAWN_COLUMNS[guardianElements.length] ?? [5];

  // Guardian gods along the bottom edge.
  guardianElements.forEach((element, index) => {
    const x = columns[index] ?? index;
    const god = makeUnit(state, `god-${element}`, { x, y: height - 1 }, element);
    const guardian: GuardianState = {
      element,
      name: GUARDIAN_NAMES[element],
      godId: god.id,
      deck: buildDeck(element),
      hand: [],
      discard: [],
      generalLost: false,
    };
    dealOpeningHand(guardian, rng);
    state.guardians.push(guardian);
  });

  // One Evil God per guardian, on shrines along the top edge.
  guardianElements.forEach((element, index) => {
    const x = columns[index] ?? index;
    const pos = { x, y: 0 };
    tiles[idx(state, pos)]!.shrine = true;
    tiles[idx(state, pos)]!.terrain = 'blighted';
    const god = makeUnit(state, `evil-god-${element}`, pos, null);
    state.evilGodIds.push(god.id);
  });

  state.rngState = rng.state;

  // Round 1 Draw Phase.
  for (const guardian of state.guardians) {
    for (let i = 0; i < CONFIG.drawPerRound; i++) {
      const card = guardian.deck.shift();
      if (card) guardian.hand.push(card);
    }
  }
  state.stats.cardsLeft = countCardsLeft(state);
  return state;
}

export function countCardsLeft(state: GameState): number {
  return state.guardians.reduce((sum, g) => sum + g.deck.length + g.hand.length, 0);
}

export const EVIL_GOD_NAMES = EVIL_NAMES;
