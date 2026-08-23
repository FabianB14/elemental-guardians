import { describe, expect, it } from 'vitest';
import { pickTarget, planEvilGod, planEvilUnit } from '../../ai/evil';
import { runEvilPhase, resolveDoomCard, spawnEvilUnit } from '../phases';
import { Rng } from '../rng';
import type { GameEvent, GameState } from '../types';
import { god, newGame, place } from './helpers';

describe('evil target priority', () => {
  it('kill-shot > god > lowest HP > lowest id', () => {
    const state = newGame(['fire']);
    const wounded = place(state, 'fire-ogre', { x: 1, y: 1 }, 'fire');
    wounded.hp = 1; // kill-shot available
    const fireGod = god(state, 'fire');
    expect(pickTarget([fireGod, wounded])?.id).toBe(wounded.id);
    // No kill-shot → god wins.
    const healthy = place(state, 'fire-ogre', { x: 2, y: 1 }, 'fire');
    expect(pickTarget([healthy, fireGod])?.id).toBe(fireGod.id);
    // No god → lowest HP.
    const hurt = place(state, 'earth-treant', { x: 3, y: 1 }, 'fire');
    hurt.hp = 3;
    const fresh = place(state, 'earth-treant', { x: 4, y: 1 }, 'fire');
    fresh.hp = 5;
    expect(pickTarget([fresh, hurt])?.id).toBe(hurt.id);
    // Same HP → lowest id.
    const twinA = place(state, 'fire-ogre', { x: 5, y: 1 }, 'fire');
    const twinB = place(state, 'fire-ogre', { x: 6, y: 1 }, 'fire');
    expect(pickTarget([twinB, twinA])?.id).toBe(twinA.id);
  });
});

describe('evil unit planning', () => {
  it('attacks in place when an enemy is adjacent', () => {
    const state = newGame(['fire']);
    const hound = place(state, 'void-hound', { x: 5, y: 5 });
    const prey = place(state, 'fire-ogre', { x: 5, y: 6 }, 'fire');
    const plan = planEvilUnit(state, hound);
    expect(plan.moveTo).toBeUndefined();
    expect(plan.attackTargetId).toBe(prey.id);
  });

  it('walks toward the nearest guardian unit when nothing is in range', () => {
    const state = newGame(['fire']);
    const hound = place(state, 'void-hound', { x: 5, y: 2 }); // MOV 4
    const plan = planEvilUnit(state, hound);
    expect(plan.moveTo).toBeDefined();
    // Moves down toward the guardians on the bottom row.
    expect(plan.moveTo!.y).toBeGreaterThan(2);
  });

  it('evil gods never move and attack one adjacent guardian unit', () => {
    const state = newGame(['fire']);
    const evilGod = state.units.find((u) => u.faction === 'evil' && u.isGod)!;
    const bait = place(
      state,
      'fire-ogre',
      { x: evilGod.pos.x, y: evilGod.pos.y + 1 },
      'fire',
    );
    const plan = planEvilGod(state, evilGod);
    expect(plan.moveTo).toBeUndefined();
    expect(plan.attackTargetId).toBe(bait.id);
  });
});

describe('doom deck', () => {
  function run(state: GameState, times: number): GameEvent[] {
    const events: GameEvent[] = [];
    const rng = new Rng(state.rngState);
    for (let i = 0; i < times; i++) resolveDoomCard(state, events, rng);
    state.rngState = rng.state;
    return events;
  }

  it('spawn cards add evil units near their gods', () => {
    const state = newGame(['fire']);
    state.doomDeck = ['spawnShadowImps'];
    const before = state.units.filter((u) => u.faction === 'evil' && !u.isGod).length;
    run(state, 1);
    const after = state.units.filter((u) => u.faction === 'evil' && !u.isGod && u.hp > 0);
    expect(after.length).toBe(before + 2);
    const shrineGod = state.units.find((u) => u.faction === 'evil' && u.isGod)!;
    for (const imp of after) {
      expect(Math.abs(imp.pos.x - shrineGod.pos.x) + Math.abs(imp.pos.y - shrineGod.pos.y)).toBeLessThanOrEqual(2);
    }
  });

  it('Dark Bolt hits the nearest troop, or a god for 1 when no troops', () => {
    const state = newGame(['fire']);
    state.doomDeck = ['darkBolt', 'darkBolt'];
    const troop = place(state, 'fire-ogre', { x: 5, y: 4 }, 'fire'); // HP 2
    run(state, 1);
    expect(troop.hp).toBe(0); // 2 damage kills it
    const fireGod = god(state, 'fire');
    run(state, 1);
    expect(fireGod.hp).toBe(fireGod.maxHp - 1);
  });

  it('Siphon permanently drains the highest-ATK troop', () => {
    const state = newGame(['fire']);
    state.doomDeck = ['siphon'];
    const strong = place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire'); // ATK 3
    place(state, 'fire-fairy', { x: 3, y: 8 }, 'fire'); // ATK 1
    run(state, 1);
    expect(strong.permAtk).toBe(-1);
    expect(strong.permDef).toBe(-1);
  });

  it('Mass Summons: each living evil god spawns an imp', () => {
    const state = newGame(['fire', 'water'], 3);
    state.doomDeck = ['massSummons'];
    const before = state.units.filter((u) => u.defId === 'shadow-imp').length;
    run(state, 1);
    expect(state.units.filter((u) => u.defId === 'shadow-imp').length).toBe(before + 2);
  });

  it('Awakening and Corruption Rising stack permanent evil ATK', async () => {
    const { effectiveAtk } = await import('../stats');
    const state = newGame(['fire']);
    const imp = place(state, 'shadow-imp', { x: 5, y: 5 }); // ATK 1
    state.doomDeck = ['awakening'];
    run(state, 1);
    expect(state.evilAtkBonus).toBe(1);
    expect(effectiveAtk(state, imp)).toBe(2);
    // Deck now empty → next draw reshuffles and escalates again.
    const events = run(state, 1);
    expect(state.evilAtkBonus).toBe(2);
    expect(state.doomReshuffles).toBe(1);
    expect(events.some((e) => e.type === 'escalation')).toBe(true);
    expect(effectiveAtk(state, imp)).toBe(3);
  });

  it('reveals guardians+1 cards on Normal and guardians+2 on Hard', () => {
    const normal = newGame(['fire', 'water'], 9, 'normal');
    const events: GameEvent[] = [];
    runEvilPhase(normal, events);
    expect(normal.stats.doomCardsResolved).toBe(3);

    const hard = newGame(['fire', 'water'], 9, 'hard');
    const hardEvents: GameEvent[] = [];
    runEvilPhase(hard, hardEvents);
    expect(hard.stats.doomCardsResolved).toBe(4);
  });

  it('summon placement round-robins across evil gods', () => {
    const state = newGame(['fire', 'water'], 3);
    const events: GameEvent[] = [];
    const first = spawnEvilUnit(state, events, 'shadow-imp');
    const second = spawnEvilUnit(state, events, 'shadow-imp');
    const gods = state.evilGodIds.map((id) => state.units.find((u) => u.id === id)!);
    const near = (unit: NonNullable<typeof first>, godUnit: (typeof gods)[number]) =>
      Math.abs(unit.pos.x - godUnit.pos.x) + Math.abs(unit.pos.y - godUnit.pos.y) === 1;
    expect(near(first!, gods[0]!)).toBe(true);
    expect(near(second!, gods[1]!)).toBe(true);
  });
});
