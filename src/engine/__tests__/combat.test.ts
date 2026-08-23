import { describe, expect, it } from 'vitest';
import { resolveAttack } from '../combat';
import { Rng } from '../rng';
import type { GameEvent } from '../types';
import { findRngFor, newGame, place } from './helpers';

/** Finds an RNG state whose next two d6 rolls are exactly (a, d). */
function rngStateForRolls(attackDie: number, defenseDie: number): number {
  return findRngFor((s) => {
    const rng = new Rng(s);
    return rng.d6() === attackDie && rng.d6() === defenseDie;
  });
}

describe('combat resolution', () => {
  it('attacker higher: defender takes 1 damage', () => {
    const state = newGame(['fire']);
    const attacker = place(state, 'fire-ogre', { x: 5, y: 5 }, 'fire'); // ATK 3
    const defender = place(state, 'shadow-imp', { x: 5, y: 6 }); // DEF 1, HP 1
    const events: GameEvent[] = [];
    // 4+3=7 vs 2+1=3 → hit
    const rng = new Rng(rngStateForRolls(4, 2));
    const outcome = resolveAttack(state, events, rng, attacker, defender);
    expect(outcome.result).toBe('hit');
    expect(defender.hp).toBe(0);
    expect(attacker.hp).toBe(attacker.maxHp);
    expect(events.some((e) => e.type === 'death')).toBe(true);
  });

  it('defender higher: attacker takes 1 riposte damage', () => {
    const state = newGame(['fire']);
    const attacker = place(state, 'fire-ogre', { x: 5, y: 5 }, 'fire'); // ATK 3, HP 2
    const defender = place(state, 'corrupted-golem', { x: 5, y: 6 }); // DEF 3, HP 3
    const events: GameEvent[] = [];
    // 1+3=4 vs 5+3=8 → riposte
    const rng = new Rng(rngStateForRolls(1, 5));
    const outcome = resolveAttack(state, events, rng, attacker, defender);
    expect(outcome.result).toBe('riposte');
    expect(defender.hp).toBe(defender.maxHp);
    expect(attacker.hp).toBe(attacker.maxHp - 1);
  });

  it('tie: nothing happens', () => {
    const state = newGame(['fire']);
    const attacker = place(state, 'fire-ogre', { x: 5, y: 5 }, 'fire'); // ATK 3
    const defender = place(state, 'corrupted-golem', { x: 5, y: 6 }); // DEF 3
    const events: GameEvent[] = [];
    // 3+3=6 vs 3+3=6 → tie
    const rng = new Rng(rngStateForRolls(3, 3));
    const outcome = resolveAttack(state, events, rng, attacker, defender);
    expect(outcome.result).toBe('tie');
    expect(defender.hp).toBe(defender.maxHp);
    expect(attacker.hp).toBe(attacker.maxHp);
  });

  it('evasive subtracts from the attacker roll', () => {
    const state = newGame(['fire', 'wind']);
    const attacker = place(state, 'shadow-imp', { x: 5, y: 5 }); // ATK 1
    const nymph = place(state, 'wind-nymph', { x: 5, y: 6 }, 'wind'); // DEF 2, Evasive 1
    const events: GameEvent[] = [];
    // 4+1-1=4 vs 2+2=4 → tie thanks to Evasive; without it, a hit.
    const rng = new Rng(rngStateForRolls(4, 2));
    const outcome = resolveAttack(state, events, rng, attacker, nymph);
    expect(outcome.result).toBe('tie');
    expect(nymph.hp).toBe(nymph.maxHp);
  });

  it('kills gods and marks generals lost', () => {
    const state = newGame(['fire']);
    const general = place(state, 'ifrit', { x: 4, y: 4 }, 'fire');
    general.hp = 1;
    const drake = place(state, 'chaos-drake', { x: 4, y: 5 }); // ATK 4
    const events: GameEvent[] = [];
    // 6+4=10 vs 1+3=4 → hit for 1 → Ifrit dies
    const rng = new Rng(rngStateForRolls(6, 1));
    resolveAttack(state, events, rng, drake, general);
    expect(general.hp).toBe(0);
    expect(state.guardians[0]!.generalLost).toBe(true);
  });
});
