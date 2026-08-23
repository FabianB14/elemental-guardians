import type { Coord } from '../data/types';
import type { GameState, Unit } from './types';

export const ORTHOGONAL: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function idx(state: { width: number }, pos: Coord): number {
  return pos.y * state.width + pos.x;
}

export function inBounds(state: GameState, pos: Coord): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < state.width && pos.y < state.height;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Manhattan distance; the game's only distance metric. */
export function distance(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function adjacent(a: Coord, b: Coord): boolean {
  return distance(a, b) === 1;
}

export function tileAt(state: GameState, pos: Coord) {
  return state.tiles[idx(state, pos)];
}

export function unitAt(state: GameState, pos: Coord): Unit | undefined {
  return state.units.find((u) => u.hp > 0 && sameCoord(u.pos, pos));
}

export function livingUnits(state: GameState): Unit[] {
  return state.units.filter((u) => u.hp > 0);
}

export function unitById(state: GameState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

/** A Rampart tile blocks movement until the round it expires has passed. */
export function isBlockedTerrain(state: GameState, pos: Coord): boolean {
  const tile = tileAt(state, pos);
  return !!tile && tile.blockedUntilRound >= state.round;
}

/** Can a unit finish its move on this tile? */
export function isPassableDestination(state: GameState, pos: Coord): boolean {
  if (!inBounds(state, pos)) return false;
  if (isBlockedTerrain(state, pos)) return false;
  return unitAt(state, pos) === undefined;
}

/** Can a unit pass through this tile mid-move? Flyers ignore occupancy. */
export function isTraversable(state: GameState, pos: Coord, flying: boolean): boolean {
  if (!inBounds(state, pos)) return false;
  if (isBlockedTerrain(state, pos)) return false;
  if (flying) return true;
  return unitAt(state, pos) === undefined;
}

export interface ReachableTile {
  pos: Coord;
  cost: number;
}

/**
 * BFS over the orthogonal grid, up to `maxSteps`.
 * Returns only tiles the unit could legally END on (empty and unblocked),
 * but traverses according to the flying rules.
 */
export function reachableTiles(
  state: GameState,
  from: Coord,
  maxSteps: number,
  flying: boolean,
): ReachableTile[] {
  const results: ReachableTile[] = [];
  if (maxSteps <= 0) return results;
  const seen = new Set<number>([idx(state, from)]);
  let frontier: Coord[] = [from];

  for (let step = 1; step <= maxSteps; step++) {
    const next: Coord[] = [];
    for (const cur of frontier) {
      for (const dir of ORTHOGONAL) {
        const pos = { x: cur.x + dir.x, y: cur.y + dir.y };
        if (!inBounds(state, pos)) continue;
        const key = idx(state, pos);
        if (seen.has(key)) continue;
        if (!isTraversable(state, pos, flying)) continue;
        seen.add(key);
        next.push(pos);
        if (isPassableDestination(state, pos)) results.push({ pos, cost: step });
      }
    }
    frontier = next;
  }
  return results;
}

/**
 * Best destination within `maxSteps` that gets closest to `goal`.
 * Ordering: smallest distance to goal, then fewest steps, then lowest tile
 * index. Fully deterministic. Returns undefined if no reachable tile improves
 * on standing still.
 */
export function stepToward(
  state: GameState,
  from: Coord,
  goal: Coord,
  maxSteps: number,
  flying: boolean,
): Coord | undefined {
  const startDist = distance(from, goal);
  let best: ReachableTile | undefined;
  let bestDist = startDist;
  for (const option of reachableTiles(state, from, maxSteps, flying)) {
    const dist = distance(option.pos, goal);
    if (dist > bestDist) continue;
    if (
      !best ||
      dist < bestDist ||
      option.cost < best.cost ||
      (option.cost === best.cost && idx(state, option.pos) < idx(state, best.pos))
    ) {
      best = option;
      bestDist = dist;
    }
  }
  if (!best || bestDist >= startDist) return undefined;
  return best.pos;
}

/** All in-bounds tiles of an NxN block centred on `center`. */
export function areaTiles(state: GameState, center: Coord, size: number): Coord[] {
  const half = Math.floor(size / 2);
  const tiles: Coord[] = [];
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      const pos = { x: center.x + dx, y: center.y + dy };
      if (inBounds(state, pos)) tiles.push(pos);
    }
  }
  return tiles;
}

/** The NxN block whose top-left corner is `origin`. Used by 2x2 effects. */
export function blockTiles(state: GameState, origin: Coord, size: number): Coord[] {
  const tiles: Coord[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const pos = { x: origin.x + dx, y: origin.y + dy };
      if (inBounds(state, pos)) tiles.push(pos);
    }
  }
  return tiles;
}

/** `length` tiles starting at `start` and running in `dir`. */
export function lineTiles(
  state: GameState,
  start: Coord,
  dir: Coord,
  length: number,
): Coord[] {
  const tiles: Coord[] = [];
  for (let i = 0; i < length; i++) {
    const pos = { x: start.x + dir.x * i, y: start.y + dir.y * i };
    if (inBounds(state, pos)) tiles.push(pos);
  }
  return tiles;
}

export function allTiles(state: GameState): Coord[] {
  const tiles: Coord[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) tiles.push({ x, y });
  }
  return tiles;
}

/**
 * Unit-vector direction from `from` to `to`, snapped to the dominant axis.
 * Ties (perfect diagonals) resolve to the horizontal axis for determinism.
 */
export function pushDirection(from: Coord, to: Coord): Coord {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { x: 1, y: 0 };
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx), y: 0 };
  return { x: 0, y: Math.sign(dy) };
}
