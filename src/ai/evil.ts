/**
 * Evil-side controller.
 *
 * Pure and deterministic: given the same state it always produces the same
 * plan. Every tie is broken by lowest unit id so identical seeds replay
 * identically. No RNG is consulted here — dice are rolled by the engine when
 * it executes the plan.
 */
import { distance, livingUnits, stepToward } from '../engine/board';
import { inAttackRange } from '../engine/combat';
import { attackRange, effectiveMov, isFlying } from '../engine/stats';
import type { Coord, GameState, Unit } from '../engine/types';

export interface EvilPlan {
  unitId: number;
  /** Destination tile, if the unit moves. */
  moveTo?: Coord;
  /** Unit to attack after moving, if any. */
  attackTargetId?: number;
}

/** Damage a plain attack deals on a hit. Used only for kill-shot detection. */
const ATTACK_DAMAGE = 1;

/**
 * Target priority: a kill-shot beats everything, then guardian gods, then the
 * lowest-HP target, then the lowest unit id.
 */
export function pickTarget(candidates: Unit[]): Unit | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const killA = a.hp <= ATTACK_DAMAGE ? 0 : 1;
    const killB = b.hp <= ATTACK_DAMAGE ? 0 : 1;
    if (killA !== killB) return killA - killB;
    const godA = a.isGod ? 0 : 1;
    const godB = b.isGod ? 0 : 1;
    if (godA !== godB) return godA - godB;
    if (a.hp !== b.hp) return a.hp - b.hp;
    return a.id - b.id;
  })[0];
}

/** The guardian unit an evil unit should walk toward. */
export function nearestGuardian(state: GameState, from: Unit): Unit | undefined {
  const guardians = livingUnits(state).filter((u) => u.faction === 'guardian');
  if (guardians.length === 0) return undefined;
  return [...guardians].sort((a, b) => {
    const distA = distance(from.pos, a.pos);
    const distB = distance(from.pos, b.pos);
    if (distA !== distB) return distA - distB;
    return a.id - b.id;
  })[0];
}

/**
 * Decides what one evil unit does this Evil Phase.
 *
 * 1. An enemy already in range is attacked where it stands.
 * 2. Otherwise the unit walks up to MOV tiles toward the nearest guardian unit
 *    and attacks if the move brought something into range.
 *
 * (The written rule says "attack, otherwise move". Letting a unit that closed
 *  the distance also swing keeps evil pressure comparable to the guardians',
 *  who move and attack in the same turn — see DECISIONS.md.)
 */
export function planEvilUnit(state: GameState, unit: Unit): EvilPlan {
  const plan: EvilPlan = { unitId: unit.id };
  if (unit.hp <= 0) return plan;

  const enemies = livingUnits(state).filter((u) => u.faction === 'guardian');
  if (enemies.length === 0) return plan;

  const inRange = enemies.filter((e) => inAttackRange(unit, e));
  if (inRange.length > 0) {
    plan.attackTargetId = pickTarget(inRange)?.id;
    return plan;
  }

  const mov = effectiveMov(state, unit);
  if (mov > 0) {
    const goal = nearestGuardian(state, unit);
    if (goal) {
      const destination = stepToward(state, unit.pos, goal.pos, mov, isFlying(unit));
      if (destination) {
        plan.moveTo = destination;
        const reach = attackRange(unit);
        const nowInRange = enemies.filter((e) => distance(destination, e.pos) <= reach);
        plan.attackTargetId = pickTarget(nowInRange)?.id;
      }
    }
  }
  return plan;
}

/** Evil gods never move; they swing at one adjacent guardian unit. */
export function planEvilGod(state: GameState, god: Unit): EvilPlan {
  const plan: EvilPlan = { unitId: god.id };
  if (god.hp <= 0) return plan;
  const adjacent = livingUnits(state).filter(
    (u) => u.faction === 'guardian' && distance(god.pos, u.pos) <= attackRange(god),
  );
  plan.attackTargetId = pickTarget(adjacent)?.id;
  return plan;
}

/** Evil units act in spawn order; gods act last, in shrine order. */
export function evilActingOrder(state: GameState): Unit[] {
  const troops = livingUnits(state)
    .filter((u) => u.faction === 'evil' && !u.isGod)
    .sort((a, b) => a.spawnOrder - b.spawnOrder);
  const gods = state.evilGodIds
    .map((id) => state.units.find((u) => u.id === id))
    .filter((u): u is Unit => !!u && u.hp > 0);
  return [...troops, ...gods];
}

/**
 * The whole Evil Phase plan, as the spec's `(state) -> actions[]`.
 *
 * Movement is simulated on a copy so later units see earlier units' new
 * positions; combat outcomes are not simulated, so the engine re-plans each
 * unit as it executes (see engine/phases.ts). Use this for previews and tests.
 */
export function planEvilTurn(state: GameState): EvilPlan[] {
  const working: GameState = structuredClone(state);
  const plans: EvilPlan[] = [];
  for (const actor of evilActingOrder(working)) {
    const unit = working.units.find((u) => u.id === actor.id);
    if (!unit || unit.hp <= 0) continue;
    const plan = unit.isGod ? planEvilGod(working, unit) : planEvilUnit(working, unit);
    if (plan.moveTo) unit.pos = { ...plan.moveTo };
    plans.push(plan);
  }
  return plans;
}
