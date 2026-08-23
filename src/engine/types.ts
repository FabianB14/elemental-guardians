import type {
  CardElement,
  ComboId,
  Coord,
  Difficulty,
  DoomCardId,
  Element,
  Faction,
  StatusKind,
  TerrainCardId,
  TerrainType,
  UltimateId,
} from '../data/types';

export type Phase =
  | 'summon'
  | 'action'
  | 'evil'
  | 'terrain'
  | 'discard'
  | 'gameOver';

export interface Status {
  kind: StatusKind;
  /** Signed magnitude. Ignored for `burn` and `rooted`. */
  amount: number;
  /** First round on which the status is active (inclusive). */
  startsRound: number;
  /** Last round on which the status is active (inclusive). */
  expiresRound: number;
  /** Short label for the UI. */
  source: string;
}

export interface Unit {
  id: number;
  defId: string;
  faction: Faction;
  element: Element | 'shadow';
  /** Guardian element that owns this unit; null for evil units. */
  owner: Element | null;
  pos: Coord;
  hp: number;
  maxHp: number;
  isGod: boolean;
  isGeneral: boolean;
  statuses: Status[];
  /** Permanent stat deltas (Siphon, Corruption Rising, Awakening). */
  permAtk: number;
  permDef: number;
  /** Reset at the start of each Action Phase. */
  tilesMovedThisTurn: number;
  attacksUsed: number;
  /** Once-per-game general ultimate spent? */
  ultimateUsed: boolean;
  /** Ascending spawn order; drives deterministic AI iteration. */
  spawnOrder: number;
}

export interface CardInstance {
  /** Unique per game, e.g. "fire-14". */
  id: string;
  defId: string;
}

export interface GuardianState {
  element: Element;
  name: string;
  godId: number;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  /** Set once the General has been summoned and destroyed. */
  generalLost: boolean;
}

export interface Tile {
  terrain: TerrainType;
  /** Rampart: impassable through the end of the given round. -1 = passable. */
  blockedUntilRound: number;
  shrine: boolean;
}

export interface GameEvent {
  type:
    | 'phase'
    | 'round'
    | 'draw'
    | 'summon'
    | 'move'
    | 'combat'
    | 'damage'
    | 'heal'
    | 'death'
    | 'status'
    | 'card'
    | 'combo'
    | 'terrain'
    | 'doom'
    | 'escalation'
    | 'discard'
    | 'gameOver'
    | 'info';
  /** Human-readable line for the combat log. Always present. */
  text: string;
  round: number;
  unitId?: number;
  targetId?: number;
  pos?: Coord;
  amount?: number;
  /** Combat detail for the dice toast. */
  dice?: {
    attackDie: number;
    attackTotal: number;
    defenseDie: number;
    defenseTotal: number;
    result: 'hit' | 'riposte' | 'tie';
  };
}

export interface GameStats {
  rounds: number;
  guardianKills: number;
  guardianLosses: number;
  doomCardsResolved: number;
  combosPlayed: number;
  cardsLeft: number;
}

export interface GameState {
  seed: number;
  rngState: number;
  difficulty: Difficulty;
  round: number;
  phase: Phase;
  width: number;
  height: number;
  tiles: Tile[];
  units: Unit[];
  guardians: GuardianState[];
  /** Guardian elements in play, in setup order. */
  guardianOrder: Element[];
  evilGodIds: number[];
  /** Round-robin cursor for evil summon placement. */
  evilSpawnCursor: number;
  /** Permanent faction-wide ATK bonus for evil units. */
  evilAtkBonus: number;
  doomDeck: DoomCardId[];
  doomDiscard: DoomCardId[];
  doomReshuffles: number;
  terrainDeck: TerrainCardId[];
  terrainDiscard: TerrainCardId[];
  /** Combos already used this round. */
  combosUsedThisRound: ComboId[];
  nextUnitId: number;
  nextSpawnOrder: number;
  result: 'ongoing' | 'victory' | 'defeat';
  stats: GameStats;
}

/** A card contributed to a combo. */
export interface ComboContribution {
  guardian: Element;
  cardId: string;
  /** Which combo element this card is standing in for (matters for Prism). */
  as: Element;
}

export type Action =
  | { type: 'endPhase' }
  | {
      type: 'summon';
      guardian: Element;
      cardId: string;
      discardCardIds: string[];
      pos: Coord;
    }
  | { type: 'move'; unitId: number; to: Coord }
  | { type: 'attack'; attackerId: number; targetId: number }
  | { type: 'support'; unitId: number; targetId: number }
  | { type: 'ultimate'; unitId: number; targetId?: number }
  | {
      type: 'playPower';
      guardian: Element;
      cardId: string;
      targetId?: number;
      pos?: Coord;
    }
  | {
      type: 'playCombo';
      combo: ComboId;
      contributions: [ComboContribution, ComboContribution];
      center: Coord;
      /** Required by line-shaped combos (Mudslide). */
      direction?: Coord;
    }
  | { type: 'discard'; guardian: Element; cardIds: string[] };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export type { CardElement, ComboId, Coord, Difficulty, Element, Faction, UltimateId };
