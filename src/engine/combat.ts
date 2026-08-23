import { distance } from './board';
import { applyStatus, damageUnit, pushEvent, unitLabel } from './effects';
import type { Rng } from './rng';
import { attackRange, effectiveAtk, effectiveDef, hasAbility, rollMod } from './stats';
import type { GameEvent, GameState, Unit } from './types';

export interface CombatOptions {
  /** Damage dealt on a successful hit. Defaults to 1. */
  damage?: number;
  /** Extra units that share the hit (Leviathan's Tidal Crash). */
  splashTargets?: Unit[];
  /** Label shown in the log. */
  source?: string;
}

export interface CombatOutcome {
  attackDie: number;
  attackTotal: number;
  defenseDie: number;
  defenseTotal: number;
  result: 'hit' | 'riposte' | 'tie';
  damage: number;
}

export function inAttackRange(attacker: Unit, target: Unit): boolean {
  return distance(attacker.pos, target.pos) <= attackRange(attacker);
}

/**
 * One attack exchange.
 *
 *   attacker: d6 + ATK + roll mods - target's Evasive
 *   defender: d6 + DEF + roll mods
 *
 * Attacker higher  -> defender takes damage (1 unless overridden)
 * Defender higher  -> attacker takes 1 (riposte)
 * Tie              -> nothing happens
 */
export function resolveAttack(
  state: GameState,
  events: GameEvent[],
  rng: Rng,
  attacker: Unit,
  defender: Unit,
  options: CombatOptions = {},
): CombatOutcome {
  const damage = options.damage ?? 1;
  const evasive = hasAbility(defender, 'evasive')?.amount ?? 0;

  const attackDie = rng.d6();
  const attackTotal = attackDie + effectiveAtk(state, attacker) + rollMod(state, attacker) - evasive;
  const defenseDie = rng.d6();
  const defenseTotal = defenseDie + effectiveDef(state, defender) + rollMod(state, defender);

  const result: CombatOutcome['result'] =
    attackTotal > defenseTotal ? 'hit' : attackTotal < defenseTotal ? 'riposte' : 'tie';

  const summary =
    result === 'hit'
      ? `hits for ${damage}`
      : result === 'riposte'
        ? 'is driven back (riposte, 1 damage)'
        : 'clashes to no effect';

  pushEvent(events, state, {
    type: 'combat',
    unitId: attacker.id,
    targetId: defender.id,
    text:
      `${unitLabel(attacker)} attacks ${unitLabel(defender)}: ` +
      `${attackDie}+${attackTotal - attackDie}=${attackTotal} vs ` +
      `${defenseDie}+${defenseTotal - defenseDie}=${defenseTotal} — ${summary}.`,
    dice: { attackDie, attackTotal, defenseDie, defenseTotal, result },
  });

  if (result === 'hit') {
    const targets = [defender, ...(options.splashTargets ?? [])];
    for (const target of targets) {
      damageUnit(state, events, target, damage, options.source ?? unitLabel(attacker));
      applyOnDamageStatus(state, events, attacker, target);
    }
  } else if (result === 'riposte') {
    damageUnit(state, events, attacker, 1, `${unitLabel(defender)}'s riposte`);
  }

  return { attackDie, attackTotal, defenseDie, defenseTotal, result, damage };
}

/** Ignite / Roots: riders that fire when this attacker damages something. */
function applyOnDamageStatus(
  state: GameState,
  events: GameEvent[],
  attacker: Unit,
  target: Unit,
): void {
  const rider = hasAbility(attacker, 'onDamageStatus');
  if (!rider || target.hp <= 0) return;
  applyStatus(state, events, target, {
    kind: rider.status,
    delayRounds: rider.delayRounds,
    durationRounds: 0,
    source: unitLabel(attacker),
  });
}
