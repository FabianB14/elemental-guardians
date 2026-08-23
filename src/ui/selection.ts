/**
 * UI interaction state: what is selected and which tiles/units are legal
 * targets for the pending action. Pure helpers over the engine's query API.
 */
import { cardDef } from '../data/cards';
import { CONFIG } from '../data/config';
import type { CardDef, ComboDef, Coord, Element } from '../data/types';
import {
  distance,
  inBounds,
  livingUnits,
  reachableTiles,
  sameCoord,
  unitAt,
  unitById,
} from '../engine/board';
import { comboFor, comboTiles } from '../engine/powers';
import { godAlive } from '../engine/phases';
import {
  attackRange,
  effectiveMov,
  hasAbility,
  isFlying,
  maxAttacks,
} from '../engine/stats';
import type { GameState, Unit } from '../engine/types';

export type Selection =
  | { mode: 'none' }
  | { mode: 'unit'; unitId: number }
  /** A summon card picked; gathering payment discards. */
  | { mode: 'summon'; guardian: Element; cardId: string; payment: string[] }
  /** A power card picked; awaiting its unit target (or tile for Rampart). */
  | { mode: 'power'; guardian: Element; cardId: string; targetId?: number }
  /** Two combo cards picked; awaiting centre (then direction for lines). */
  | {
      mode: 'combo';
      picks: { guardian: Element; cardId: string }[];
      center?: Coord;
    }
  | { mode: 'discardPick'; guardian: Element; picks: string[] };

export const NO_SELECTION: Selection = { mode: 'none' };

export function summonPaymentReady(state: GameState, sel: Selection): boolean {
  if (sel.mode !== 'summon') return false;
  const guardian = state.guardians.find((g) => g.element === sel.guardian);
  const card = guardian?.hand.find((c) => c.id === sel.cardId);
  if (!card) return false;
  const def = cardDef(card.defId);
  return def.kind === 'summon' && sel.payment.length === def.cost;
}

/** Legal summon tiles for a guardian: within 2 of god or adjacent to General. */
export function summonTiles(state: GameState, element: Element): Coord[] {
  const guardian = state.guardians.find((g) => g.element === element);
  if (!guardian || !godAlive(state, guardian.godId)) return [];
  const god = unitById(state, guardian.godId)!;
  const general = livingUnits(state).find((u) => u.owner === element && u.isGeneral);
  const tiles: Coord[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const pos = { x, y };
      if (unitAt(state, pos)) continue;
      const nearGod = distance(god.pos, pos) <= CONFIG.summonRangeFromGod;
      const nearGeneral =
        !!general && distance(general.pos, pos) <= CONFIG.summonRangeFromGeneral;
      if (nearGod || nearGeneral) tiles.push(pos);
    }
  }
  return tiles;
}

export function moveTilesFor(state: GameState, unit: Unit): Coord[] {
  if (state.phase !== 'action') return [];
  if (unit.tilesMovedThisTurn > 0 || unit.attacksUsed > 0) return [];
  return reachableTiles(state, unit.pos, effectiveMov(state, unit), isFlying(unit)).map(
    (t) => t.pos,
  );
}

export function attackTargetsFor(state: GameState, unit: Unit): Unit[] {
  if (state.phase !== 'action') return [];
  if (unit.attacksUsed >= maxAttacks(unit)) return [];
  const reach = attackRange(unit);
  return livingUnits(state).filter(
    (u) => u.faction === 'evil' && distance(u.pos, unit.pos) <= reach,
  );
}

export function supportTargetsFor(state: GameState, unit: Unit): Unit[] {
  if (state.phase !== 'action') return [];
  if (!hasAbility(unit, 'healInstead')) return [];
  if (unit.attacksUsed >= maxAttacks(unit)) return [];
  return livingUnits(state).filter(
    (u) =>
      u.faction === 'guardian' &&
      u.id !== unit.id &&
      distance(u.pos, unit.pos) === 1,
  );
}

/** Units a power card may legally target right now. */
export function powerTargets(state: GameState, element: Element, cardId: string): Unit[] {
  const guardian = state.guardians.find((g) => g.element === element);
  const card = guardian?.hand.find((c) => c.id === cardId);
  if (!guardian || !card) return [];
  const def = cardDef(card.defId);
  if (def.kind !== 'power' || def.target === 'emptyTile') return [];
  const god = unitById(state, guardian.godId);
  if (!god || god.hp <= 0) return [];
  return livingUnits(state).filter((u) => {
    if (def.range !== null && distance(god.pos, u.pos) > def.range) return false;
    switch (def.target) {
      case 'enemyUnit':
        return u.faction === 'evil';
      case 'enemyTroop':
        return u.faction === 'evil' && !u.isGod;
      case 'allyUnit':
        return u.faction === 'guardian' && !u.isGod;
      case 'allyUnitOrGod':
        return u.faction === 'guardian';
      default:
        return false;
    }
  });
}

/** Tiles a tile-targeting power (Rampart) or a move-destination step allows. */
export function powerTiles(
  state: GameState,
  element: Element,
  cardId: string,
  targetId?: number,
): Coord[] {
  const guardian = state.guardians.find((g) => g.element === element);
  const card = guardian?.hand.find((c) => c.id === cardId);
  if (!guardian || !card) return [];
  const def = cardDef(card.defId);
  if (def.kind !== 'power') return [];
  const god = unitById(state, guardian.godId);
  if (!god || god.hp <= 0) return [];

  if (def.effect.kind === 'blockTile') {
    const tiles: Coord[] = [];
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const pos = { x, y };
        if (unitAt(state, pos)) continue;
        if (def.range !== null && distance(god.pos, pos) > def.range) continue;
        tiles.push(pos);
      }
    }
    return tiles;
  }

  if (def.effect.kind === 'moveUnit' && targetId !== undefined) {
    const target = unitById(state, targetId);
    if (!target || target.hp <= 0) return [];
    if (def.effect.teleport) {
      const tiles: Coord[] = [];
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const pos = { x, y };
          if (unitAt(state, pos)) continue;
          if (distance(target.pos, pos) <= def.effect.tiles) tiles.push(pos);
        }
      }
      return tiles;
    }
    return reachableTiles(state, target.pos, def.effect.tiles, isFlying(target)).map(
      (t) => t.pos,
    );
  }
  return [];
}

export interface ComboPickInfo {
  combo: ComboDef | undefined;
  /** Element roles resolved for the two picks (prisms bound greedily). */
  roles: [Element, Element] | undefined;
}

/** Resolves which combo two picked cards form. Prism binds to whatever works. */
export function resolveComboPick(
  state: GameState,
  picks: { guardian: Element; cardId: string }[],
): ComboPickInfo {
  if (picks.length !== 2) return { combo: undefined, roles: undefined };
  const defs = picks.map((pick) => {
    const guardian = state.guardians.find((g) => g.element === pick.guardian);
    const card = guardian?.hand.find((c) => c.id === pick.cardId);
    return card ? cardDef(card.defId) : undefined;
  });
  if (defs.some((d) => !d || d.kind === 'summon')) {
    return { combo: undefined, roles: undefined };
  }
  const elementsFor = (def: CardDef): Element[] =>
    def.kind === 'prism'
      ? ['fire', 'water', 'wind', 'earth']
      : [def.element as Element];
  for (const a of elementsFor(defs[0]!)) {
    for (const b of elementsFor(defs[1]!)) {
      if (a === b) continue;
      const combo = comboFor(a, b);
      if (combo && !state.combosUsedThisRound.includes(combo.id)) {
        return { combo, roles: [a, b] };
      }
    }
  }
  return { combo: undefined, roles: undefined };
}

/** Legal centre tiles for a pending combo. */
export function comboCenters(
  state: GameState,
  picks: { guardian: Element; cardId: string }[],
): Coord[] {
  const { combo } = resolveComboPick(state, picks);
  if (!combo) return [];
  const gods = picks
    .map((p) => state.guardians.find((g) => g.element === p.guardian))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => unitById(state, g.godId))
    .filter((u): u is Unit => !!u && u.hp > 0);
  const tiles: Coord[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const pos = { x, y };
      if (gods.some((god) => distance(god.pos, pos) <= CONFIG.comboRange)) {
        if (combo.shape.kind === 'single' && !unitAt(state, pos)) continue;
        tiles.push(pos);
      }
    }
  }
  return tiles;
}

/** Direction picks for a line combo: the four neighbours of the centre. */
export function comboDirectionTiles(state: GameState, center: Coord): Coord[] {
  return [
    { x: center.x, y: center.y - 1 },
    { x: center.x + 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x - 1, y: center.y },
  ].filter((pos) => inBounds(state, pos));
}

/** Area preview for the pending combo at a hovered/selected centre. */
export function comboPreviewTiles(
  state: GameState,
  picks: { guardian: Element; cardId: string }[],
  center: Coord,
  direction?: Coord,
): Coord[] {
  const { combo } = resolveComboPick(state, picks);
  if (!combo) return [];
  if (combo.shape.kind === 'line' && !direction) return [];
  try {
    return comboTiles(state, combo, center, direction);
  } catch {
    return [];
  }
}

export function tileKey(pos: Coord): string {
  return `${pos.x},${pos.y}`;
}

export function inSet(tiles: Coord[], pos: Coord): boolean {
  return tiles.some((t) => sameCoord(t, pos));
}
