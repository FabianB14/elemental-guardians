import { describe, expect, it } from 'vitest';
import { idx } from '../board';
import { applyAction, IllegalActionError } from '../reducer';
import type { GameState } from '../types';
import type { Element } from '../../data/types';
import { god, guardianOf, newGame, place } from './helpers';

/** Puts a card def into a guardian's hand (fabricated instance). */
function give(state: GameState, element: Element, defId: string): string {
  const guardian = guardianOf(state, element);
  const id = `test-${element}-${defId}-${guardian.hand.length}-${Math.floor(state.rngState % 1000)}`;
  guardian.hand.push({ id, defId });
  return id;
}

function toAction(state: GameState): GameState {
  return applyAction(state, { type: 'endPhase' }).state;
}

describe('combos', () => {
  it('Firestorm (fire+wind): 2 damage to enemies in 3x3', () => {
    let state = newGame(['fire', 'wind']);
    const drake = place(state, 'chaos-drake', { x: 5, y: 7 }); // HP 4
    const imp = place(state, 'shadow-imp', { x: 6, y: 7 }); // HP 1
    const bystander = place(state, 'shadow-imp', { x: 9, y: 7 });
    const ally = place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire');
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const gust = give(state, 'wind', 'gust');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'firestorm',
      contributions: [
        { guardian: 'fire', cardId: fireball, as: 'fire' },
        { guardian: 'wind', cardId: gust, as: 'wind' },
      ],
      center: { x: 5, y: 7 },
    });
    expect(next.units.find((u) => u.id === drake.id)!.hp).toBe(2);
    expect(next.units.find((u) => u.id === imp.id)!.hp).toBe(0);
    expect(next.units.find((u) => u.id === bystander.id)!.hp).toBe(1);
    expect(next.units.find((u) => u.id === ally.id)!.hp).toBe(ally.maxHp); // allies safe
  });

  it('Meteor (fire+earth): 3 damage to one unit, tile becomes Volcanic', () => {
    let state = newGame(['fire', 'earth']);
    const drake = place(state, 'chaos-drake', { x: 4, y: 7 }); // HP 4
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const stoneskin = give(state, 'earth', 'stoneskin');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'meteor',
      contributions: [
        { guardian: 'fire', cardId: fireball, as: 'fire' },
        { guardian: 'earth', cardId: stoneskin, as: 'earth' },
      ],
      center: { x: 4, y: 7 },
    });
    expect(next.units.find((u) => u.id === drake.id)!.hp).toBe(1);
    expect(next.tiles[idx(next, { x: 4, y: 7 })]!.terrain).toBe('volcanic');
  });

  it('Scalding Mist (fire+water): 1 damage + Burn in 3x3', () => {
    let state = newGame(['fire', 'water']);
    const golem = place(state, 'corrupted-golem', { x: 4, y: 7 }); // HP 3
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const riptide = give(state, 'water', 'riptide');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'scaldingMist',
      contributions: [
        { guardian: 'fire', cardId: fireball, as: 'fire' },
        { guardian: 'water', cardId: riptide, as: 'water' },
      ],
      center: { x: 4, y: 7 },
    });
    const hit = next.units.find((u) => u.id === golem.id)!;
    expect(hit.hp).toBe(2);
    expect(hit.statuses.some((s) => s.kind === 'burn')).toBe(true);
  });

  it('Frost Typhoon (water+wind): -1 ATK now, Rooted next round', () => {
    let state = newGame(['water', 'wind']);
    const drake = place(state, 'chaos-drake', { x: 4, y: 7 }); // ATK 4
    state = toAction(state);
    const healingTide = give(state, 'water', 'healing-tide');
    const gust = give(state, 'wind', 'gust');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'frostTyphoon',
      contributions: [
        { guardian: 'water', cardId: healingTide, as: 'water' },
        { guardian: 'wind', cardId: gust, as: 'wind' },
      ],
      center: { x: 4, y: 7 },
    });
    const hit = next.units.find((u) => u.id === drake.id)!;
    const atkMod = hit.statuses.find((s) => s.kind === 'atkMod');
    expect(atkMod?.amount).toBe(-1);
    expect(atkMod?.startsRound).toBe(next.round);
    const rooted = hit.statuses.find((s) => s.kind === 'rooted');
    expect(rooted?.startsRound).toBe(next.round + 1);
  });

  it('Mudslide (water+earth): line push 2 + 1 damage', () => {
    let state = newGame(['water', 'earth']);
    const golem = place(state, 'corrupted-golem', { x: 3, y: 6 }); // HP 3
    state = toAction(state);
    const riptide = give(state, 'water', 'riptide');
    const rampart = give(state, 'earth', 'rampart');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'mudslide',
      contributions: [
        { guardian: 'water', cardId: riptide, as: 'water' },
        { guardian: 'earth', cardId: rampart, as: 'earth' },
      ],
      center: { x: 3, y: 8 },
      direction: { x: 0, y: -1 }, // line runs upward from (3,8) to (3,5)
    });
    const hit = next.units.find((u) => u.id === golem.id)!;
    expect(hit.hp).toBe(2);
    expect(hit.pos).toEqual({ x: 3, y: 4 }); // pushed 2 up the line
  });

  it('Sandstorm (wind+earth): -1 on all rolls next round', () => {
    let state = newGame(['wind', 'earth']);
    const drake = place(state, 'chaos-drake', { x: 4, y: 7 });
    state = toAction(state);
    const gust = give(state, 'wind', 'gust');
    const stoneskin = give(state, 'earth', 'stoneskin');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'sandstorm',
      contributions: [
        { guardian: 'wind', cardId: gust, as: 'wind' },
        { guardian: 'earth', cardId: stoneskin, as: 'earth' },
      ],
      center: { x: 4, y: 7 },
    });
    const hit = next.units.find((u) => u.id === drake.id)!;
    const mod = hit.statuses.find((s) => s.kind === 'rollMod');
    expect(mod?.amount).toBe(-1);
    expect(mod?.startsRound).toBe(next.round + 1);
  });

  it('Prism stands in for any element', () => {
    let state = newGame(['fire']);
    place(state, 'shadow-imp', { x: 5, y: 7 });
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const prism = give(state, 'fire', 'prism');
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'firestorm',
      contributions: [
        { guardian: 'fire', cardId: fireball, as: 'fire' },
        { guardian: 'fire', cardId: prism, as: 'wind' },
      ],
      center: { x: 5, y: 7 },
    });
    expect(next.stats.combosPlayed).toBe(1);
  });

  it('rejects a second use of the same combo in one round', () => {
    let state = newGame(['fire', 'wind']);
    state = toAction(state);
    const a1 = give(state, 'fire', 'fireball');
    const a2 = give(state, 'wind', 'gust');
    const b1 = give(state, 'fire', 'fireball');
    const b2 = give(state, 'wind', 'gust');
    const first = applyAction(state, {
      type: 'playCombo',
      combo: 'firestorm',
      contributions: [
        { guardian: 'fire', cardId: a1, as: 'fire' },
        { guardian: 'wind', cardId: a2, as: 'wind' },
      ],
      center: { x: 5, y: 7 },
    }).state;
    expect(() =>
      applyAction(first, {
        type: 'playCombo',
        combo: 'firestorm',
        contributions: [
          { guardian: 'fire', cardId: b1, as: 'fire' },
          { guardian: 'wind', cardId: b2, as: 'wind' },
        ],
        center: { x: 5, y: 7 },
      }),
    ).toThrow(/already been played/);
  });

  it('rejects centres beyond 5 tiles of every contributing god', () => {
    let state = newGame(['fire', 'wind']);
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const gust = give(state, 'wind', 'gust');
    expect(() =>
      applyAction(state, {
        type: 'playCombo',
        combo: 'firestorm',
        contributions: [
          { guardian: 'fire', cardId: fireball, as: 'fire' },
          { guardian: 'wind', cardId: gust, as: 'wind' },
        ],
        center: { x: 5, y: 0 },
      }),
    ).toThrow(IllegalActionError);
  });

  it('rejects mismatched element roles', () => {
    let state = newGame(['fire', 'wind']);
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const gust = give(state, 'wind', 'gust');
    expect(() =>
      applyAction(state, {
        type: 'playCombo',
        combo: 'firestorm',
        contributions: [
          { guardian: 'fire', cardId: fireball, as: 'wind' }, // lie about the element
          { guardian: 'wind', cardId: gust, as: 'fire' },
        ],
        center: { x: 5, y: 7 },
      }),
    ).toThrow(IllegalActionError);
  });

  it('spends both cards to the discard', () => {
    let state = newGame(['fire', 'wind']);
    place(state, 'shadow-imp', { x: 5, y: 7 });
    state = toAction(state);
    const fireball = give(state, 'fire', 'fireball');
    const gust = give(state, 'wind', 'gust');
    const fireDiscard = guardianOf(state, 'fire').discard.length;
    const windDiscard = guardianOf(state, 'wind').discard.length;
    const { state: next } = applyAction(state, {
      type: 'playCombo',
      combo: 'firestorm',
      contributions: [
        { guardian: 'fire', cardId: fireball, as: 'fire' },
        { guardian: 'wind', cardId: gust, as: 'wind' },
      ],
      center: { x: 5, y: 7 },
    });
    expect(guardianOf(next, 'fire').discard.length).toBe(fireDiscard + 1);
    expect(guardianOf(next, 'wind').discard.length).toBe(windDiscard + 1);
  });

  void god;
});
