/**
 * Shared domain types for all data files.
 *
 * NOTHING in /src/data may import from /src/engine, /src/ai or /src/ui.
 * Data is the base layer: pure, typed, tunable balance numbers.
 */

export type Element = 'fire' | 'water' | 'wind' | 'earth';

/** Element-like tag used on cards. `prism` is a wild power card. */
export type CardElement = Element | 'prism';

export type Faction = 'guardian' | 'evil';

export type TerrainType =
  | 'plains'
  | 'volcanic'
  | 'tide'
  | 'gale'
  | 'stone'
  | 'blighted';

export interface Coord {
  x: number;
  y: number;
}

export type UltimateId = 'inferno' | 'cyclone' | 'tidalCrash' | 'quake';

export type StatusKind =
  | 'burn'
  | 'rooted'
  | 'atkMod'
  | 'defMod'
  | 'movMod'
  | 'rollMod';

/**
 * Unit abilities. Every ability is a tagged datum; the engine switches on the
 * tag. Adding a stat tweak means editing data, never engine logic.
 */
export type Ability =
  /** Ignores terrain MOV penalties, may move through occupied tiles. */
  | { tag: 'flying' }
  /** Attackers targeting this unit get `amount` subtracted from their roll. */
  | { tag: 'evasive'; amount: number }
  /** May attack at Manhattan distance up to `range` instead of only adjacent. */
  | { tag: 'ranged'; range: number }
  /** May attack twice in one Action Phase. */
  | { tag: 'doubleAttack' }
  /** Successful attacks deal this much damage instead of 1. */
  | { tag: 'heavyBlow'; damage: number }
  /** May attack twice if it did not move this turn. */
  | { tag: 'doubleAttackIfStill' }
  /** +atk on a turn it moved at least `minTiles` tiles. */
  | { tag: 'movedBonus'; minTiles: number; atk: number }
  /** Stat bonus while standing on a given terrain. */
  | {
      tag: 'terrainBonus';
      terrain: TerrainType;
      atk?: number;
      def?: number;
      mov?: number;
    }
  /** Buffs allied units within `radius` (Manhattan). Excludes the source. */
  | {
      tag: 'aura';
      radius: number;
      atk?: number;
      def?: number;
      mov?: number;
      /** Restrict to allies of this element. */
      element?: Element;
      /** Restrict to non-god units. */
      troopsOnly?: boolean;
    }
  /** +atk while adjacent to another allied unit with the given defId. */
  | { tag: 'packBonus'; defId: string; atk: number }
  /** Units damaged by this unit's attacks gain a status. */
  | { tag: 'onDamageStatus'; status: 'burn' | 'rooted'; delayRounds: 0 | 1 }
  /** Instead of attacking: heal an adjacent ally (and optionally cleanse it). */
  | { tag: 'healInstead'; amount: number; cleanse: boolean }
  /** Once-per-game general ultimate. */
  | { tag: 'ultimate'; id: UltimateId; name: string; description: string };

export interface UnitDef {
  id: string;
  name: string;
  /** Short label drawn on the board token. */
  initials: string;
  faction: Faction;
  element: Element | 'shadow';
  cost: number;
  atk: number;
  def: number;
  mov: number;
  hp: number;
  isGod?: boolean;
  isGeneral?: boolean;
  abilities: Ability[];
  /** Flavour text shown in the UI. */
  text?: string;
}

/** Where a power card may be aimed. */
export type PowerTargetKind =
  | 'enemyUnit'
  | 'allyUnit'
  | 'allyUnitOrGod'
  | 'enemyTroop'
  | 'emptyTile';

export type PowerEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'buff'; stat: 'atk' | 'def'; amount: number; durationRounds: number }
  | { kind: 'moveUnit'; tiles: number; teleport: boolean }
  | { kind: 'blockTile' };

export interface PowerCardDef {
  id: string;
  name: string;
  kind: 'power';
  element: CardElement;
  /** Power cards are free to play; only summons cost discards. */
  cost: 0;
  target: PowerTargetKind;
  /** Max Manhattan distance from the casting guardian's god. null = unlimited. */
  range: number | null;
  effect: PowerEffect;
  text: string;
}

export interface SummonCardDef {
  id: string;
  name: string;
  kind: 'summon';
  element: CardElement;
  cost: number;
  unitDefId: string;
  text: string;
}

export interface PrismCardDef {
  id: string;
  name: string;
  kind: 'prism';
  element: 'prism';
  cost: 0;
  text: string;
}

export type CardDef = PowerCardDef | SummonCardDef | PrismCardDef;

export type ComboId =
  | 'firestorm'
  | 'meteor'
  | 'scaldingMist'
  | 'frostTyphoon'
  | 'mudslide'
  | 'sandstorm';

export type ComboShape =
  | { kind: 'area'; size: number }
  | { kind: 'single' }
  | { kind: 'line'; length: number };

export interface ComboEffectSpec {
  damage?: number;
  /** Applies Burn to everything hit. */
  burn?: boolean;
  /** Applies Rooted; `delayRounds: 1` means "next round". */
  root?: { delayRounds: 0 | 1 };
  /** Timed stat modifiers applied to everything hit. */
  mods?: Array<{
    kind: StatusKind;
    amount: number;
    delayRounds: 0 | 1;
    durationRounds: number;
  }>;
  /** Pushes targets this many tiles away from the combo centre. */
  push?: number;
  /** Repaints the hit tiles. */
  paint?: TerrainType;
}

export interface ComboDef {
  id: ComboId;
  name: string;
  elements: [Element, Element];
  shape: ComboShape;
  effect: ComboEffectSpec;
  text: string;
}

export type TerrainCardId =
  | 'volcanicSurge'
  | 'risingTide'
  | 'galeFront'
  | 'tectonicShift'
  | 'withering'
  | 'stillness';

export interface TerrainCardDef {
  id: TerrainCardId;
  name: string;
  text: string;
}

export type DoomCardId =
  | 'spawnShadowImps'
  | 'spawnVoidHounds'
  | 'spawnBlightOgre'
  | 'spawnDreadWraith'
  | 'spawnCorruptedGolem'
  | 'spawnChaosDrake'
  | 'darkBolt'
  | 'creepingBlight'
  | 'siphon'
  | 'massSummons'
  | 'awakening';

export interface DoomCardDef {
  id: DoomCardId;
  name: string;
  text: string;
  /** Spawn cards: which unit and how many. */
  spawn?: { unitDefId: string; count: number };
}

export type Difficulty = 'normal' | 'hard';
