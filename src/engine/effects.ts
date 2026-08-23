import type { Coord, StatusKind, TerrainType } from '../data/types';
import { idx, inBounds, isPassableDestination, unitAt, unitById } from './board';
import { defOf } from './stats';
import type { GameEvent, GameState, Status, Unit } from './types';

export function pushEvent(
  events: GameEvent[],
  state: GameState,
  event: Omit<GameEvent, 'round'>,
): void {
  events.push({ ...event, round: state.round });
}

export function unitLabel(unit: Unit): string {
  return `${defOf(unit).name} #${unit.id}`;
}

/** Applies damage, emits events, and removes the unit if it hits 0 HP. */
export function damageUnit(
  state: GameState,
  events: GameEvent[],
  unit: Unit,
  amount: number,
  source: string,
): void {
  if (unit.hp <= 0 || amount <= 0) return;
  unit.hp = Math.max(0, unit.hp - amount);
  pushEvent(events, state, {
    type: 'damage',
    unitId: unit.id,
    amount,
    text: `${unitLabel(unit)} takes ${amount} damage from ${source} (${unit.hp}/${unit.maxHp}).`,
  });
  if (unit.hp === 0) killUnit(state, events, unit);
}

export function killUnit(state: GameState, events: GameEvent[], unit: Unit): void {
  unit.hp = 0;
  pushEvent(events, state, {
    type: 'death',
    unitId: unit.id,
    text: `${unitLabel(unit)} is destroyed.`,
  });
  if (unit.faction === 'evil') state.stats.guardianKills++;
  else state.stats.guardianLosses++;
  if (unit.faction === 'guardian' && unit.isGeneral && unit.owner) {
    const guardian = state.guardians.find((g) => g.element === unit.owner);
    if (guardian) guardian.generalLost = true;
  }
}

export function healUnit(
  state: GameState,
  events: GameEvent[],
  unit: Unit,
  amount: number,
  source: string,
): void {
  if (unit.hp <= 0) return;
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + amount);
  const healed = unit.hp - before;
  pushEvent(events, state, {
    type: 'heal',
    unitId: unit.id,
    amount: healed,
    text:
      healed > 0
        ? `${unitLabel(unit)} heals ${healed} from ${source} (${unit.hp}/${unit.maxHp}).`
        : `${unitLabel(unit)} is already at full health.`,
  });
}

export interface StatusSpec {
  kind: StatusKind;
  amount?: number;
  /** 0 = takes effect now, 1 = takes effect next round. */
  delayRounds?: 0 | 1;
  /** Extra rounds beyond the first active round. 0 = this round only. */
  durationRounds?: number;
  source: string;
}

export function applyStatus(
  state: GameState,
  events: GameEvent[],
  unit: Unit,
  spec: StatusSpec,
): void {
  if (unit.hp <= 0) return;
  const startsRound = state.round + (spec.delayRounds ?? 0);
  const status: Status = {
    kind: spec.kind,
    amount: spec.amount ?? 0,
    startsRound,
    expiresRound: startsRound + (spec.durationRounds ?? 0),
    source: spec.source,
  };
  unit.statuses.push(status);
  pushEvent(events, state, {
    type: 'status',
    unitId: unit.id,
    text: `${unitLabel(unit)} gains ${describeStatus(status)} (${spec.source}).`,
  });
}

export function describeStatus(status: Status): string {
  switch (status.kind) {
    case 'burn':
      return 'Burn';
    case 'rooted':
      return 'Rooted';
    case 'atkMod':
      return `${signed(status.amount)} ATK`;
    case 'defMod':
      return `${signed(status.amount)} DEF`;
    case 'movMod':
      return `${signed(status.amount)} MOV`;
    case 'rollMod':
      return `${signed(status.amount)} to rolls`;
  }
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function paintTerrain(
  state: GameState,
  events: GameEvent[],
  tiles: Coord[],
  terrain: TerrainType,
  source: string,
): void {
  let painted = 0;
  for (const pos of tiles) {
    const tile = state.tiles[idx(state, pos)];
    if (!tile) continue;
    if (tile.terrain !== terrain) painted++;
    tile.terrain = terrain;
  }
  if (painted > 0) {
    pushEvent(events, state, {
      type: 'terrain',
      text: `${source}: ${painted} tile${painted === 1 ? '' : 's'} became ${terrain}.`,
    });
  }
}

/**
 * Shoves a unit up to `tiles` steps in `dir`, stopping at the first tile it
 * cannot enter. Returns how far it actually moved.
 */
export function pushUnit(
  state: GameState,
  events: GameEvent[],
  unit: Unit,
  dir: Coord,
  tiles: number,
): number {
  if (unit.hp <= 0) return 0;
  const from = { ...unit.pos };
  let moved = 0;
  for (let i = 0; i < tiles; i++) {
    const next = { x: unit.pos.x + dir.x, y: unit.pos.y + dir.y };
    if (!inBounds(state, next)) break;
    if (!isPassableDestination(state, next)) break;
    unit.pos = next;
    moved++;
  }
  if (moved > 0) {
    pushEvent(events, state, {
      type: 'move',
      unitId: unit.id,
      pos: { ...unit.pos },
      text: `${unitLabel(unit)} is pushed ${moved} tile${moved === 1 ? '' : 's'} from (${from.x},${from.y}) to (${unit.pos.x},${unit.pos.y}).`,
    });
  }
  return moved;
}

export function moveUnitTo(
  state: GameState,
  events: GameEvent[],
  unit: Unit,
  to: Coord,
  steps: number,
  source: string,
): void {
  const from = { ...unit.pos };
  unit.pos = { ...to };
  unit.tilesMovedThisTurn += steps;
  pushEvent(events, state, {
    type: 'move',
    unitId: unit.id,
    pos: { ...to },
    text: `${unitLabel(unit)} moves from (${from.x},${from.y}) to (${to.x},${to.y})${source ? ` (${source})` : ''}.`,
  });
}

export function requireUnit(state: GameState, id: number): Unit {
  const unit = unitById(state, id);
  if (!unit) throw new IllegalActionError(`No such unit: ${id}`);
  if (unit.hp <= 0) throw new IllegalActionError(`Unit ${id} is destroyed.`);
  return unit;
}

export function requireEmpty(state: GameState, pos: Coord): void {
  if (!inBounds(state, pos)) throw new IllegalActionError('Target is off the board.');
  if (unitAt(state, pos)) throw new IllegalActionError('Target tile is occupied.');
}

/** Thrown for any action the rules do not permit. Never for engine bugs. */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
