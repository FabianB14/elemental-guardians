import type { Coord, Element } from '../../data/types';
import { spawnUnit, createGame } from '../setup';
import type { GameState, Unit } from '../types';

export function newGame(
  guardians: Element[] = ['fire'],
  seed: number | string = 42,
  difficulty: 'normal' | 'hard' = 'normal',
): GameState {
  return createGame({ guardians, seed, difficulty });
}

/** Drops a unit straight onto the board, bypassing summon rules. */
export function place(
  state: GameState,
  defId: string,
  pos: Coord,
  owner: Element | null = null,
): Unit {
  return spawnUnit(state, defId, pos, owner);
}

export function god(state: GameState, element: Element): Unit {
  const guardian = state.guardians.find((g) => g.element === element)!;
  return state.units.find((u) => u.id === guardian.godId)!;
}

export function guardianOf(state: GameState, element: Element) {
  return state.guardians.find((g) => g.element === element)!;
}

/** Force the RNG so the next two d6 rolls come out as desired (1-6). */
export function findRngFor(
  roll: (state: number) => boolean,
  start = 0,
): number {
  for (let s = start; s < start + 2_000_000; s++) {
    if (roll(s)) return s;
  }
  throw new Error('No RNG state found — loosen the predicate.');
}
