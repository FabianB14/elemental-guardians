import { describe, expect, it } from 'vitest';
import { idx } from '../board';
import { applyAction, IllegalActionError } from '../reducer';
import type { GameState } from '../types';
import type { Element } from '../../data/types';
import { god, guardianOf, newGame, place } from './helpers';

function give(state: GameState, element: Element, defId: string): string {
  const guardian = guardianOf(state, element);
  const id = `test-${element}-${defId}-${guardian.hand.length}`;
  guardian.hand.push({ id, defId });
  return id;
}

function toAction(state: GameState): GameState {
  return applyAction(state, { type: 'endPhase' }).state;
}

describe('power cards', () => {
  it('Fireball: 2 damage within 3 of the god', () => {
    let state = newGame(['fire']);
    const target = place(state, 'corrupted-golem', { x: 5, y: 8 }); // HP 3
    state = toAction(state);
    const card = give(state, 'fire', 'fireball');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'fire',
      cardId: card,
      targetId: target.id,
    });
    expect(next.units.find((u) => u.id === target.id)!.hp).toBe(1);
  });

  it('Fireball respects range 3 from the god', () => {
    let state = newGame(['fire']);
    const target = place(state, 'corrupted-golem', { x: 5, y: 3 });
    state = toAction(state);
    const card = give(state, 'fire', 'fireball');
    expect(() =>
      applyAction(state, {
        type: 'playPower',
        guardian: 'fire',
        cardId: card,
        targetId: target.id,
      }),
    ).toThrow(/range 3/);
  });

  it('Overheat: +2 ATK this round, gone next round', () => {
    let state = newGame(['fire']);
    const ogre = place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire');
    state = toAction(state);
    const card = give(state, 'fire', 'overheat');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'fire',
      cardId: card,
      targetId: ogre.id,
    });
    const buffed = next.units.find((u) => u.id === ogre.id)!;
    const mod = buffed.statuses.find((s) => s.kind === 'atkMod');
    expect(mod?.amount).toBe(2);
    expect(mod?.expiresRound).toBe(next.round);
  });

  it('Healing Tide: heals a god 2, capped at max', () => {
    let state = newGame(['water']);
    god(state, 'water').hp = 17;
    state = toAction(state);
    const card = give(state, 'water', 'healing-tide');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'water',
      cardId: card,
      targetId: god(state, 'water').id,
    });
    expect(next.units.find((u) => u.isGod && u.faction === 'guardian')!.hp).toBe(19);
  });

  it('Gust moves an ally up to 2 reachable tiles', () => {
    let state = newGame(['wind']);
    const pixie = place(state, 'wind-pixie', { x: 5, y: 8 }, 'wind');
    state = toAction(state);
    const card = give(state, 'wind', 'gust');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'wind',
      cardId: card,
      targetId: pixie.id,
      pos: { x: 5, y: 6 },
    });
    expect(next.units.find((u) => u.id === pixie.id)!.pos).toEqual({ x: 5, y: 6 });
  });

  it('Slipstream teleports within 3 even over walls', () => {
    let state = newGame(['wind']);
    const pixie = place(state, 'wind-pixie', { x: 5, y: 8 }, 'wind');
    place(state, 'shadow-imp', { x: 4, y: 8 });
    place(state, 'shadow-imp', { x: 5, y: 7 });
    place(state, 'shadow-imp', { x: 6, y: 8 });
    state = toAction(state);
    const card = give(state, 'wind', 'slipstream');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'wind',
      cardId: card,
      targetId: pixie.id,
      pos: { x: 5, y: 5 },
    });
    expect(next.units.find((u) => u.id === pixie.id)!.pos).toEqual({ x: 5, y: 5 });
  });

  it('Riptide drags an enemy troop but never a god', () => {
    let state = newGame(['water']);
    const imp = place(state, 'shadow-imp', { x: 5, y: 7 });
    state = toAction(state);
    const card = give(state, 'water', 'riptide');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'water',
      cardId: card,
      targetId: imp.id,
      pos: { x: 5, y: 9 },
    });
    expect(next.units.find((u) => u.id === imp.id)!.pos).toEqual({ x: 5, y: 9 });

    const evilGod = state.units.find((u) => u.faction === 'evil' && u.isGod)!;
    const card2 = give(state, 'water', 'riptide');
    expect(() =>
      applyAction(state, {
        type: 'playPower',
        guardian: 'water',
        cardId: card2,
        targetId: evilGod.id,
        pos: { x: 5, y: 1 },
      }),
    ).toThrow(IllegalActionError);
  });

  it('Stoneskin: +2 DEF this round', () => {
    let state = newGame(['earth']);
    const dwarf = place(state, 'earth-dwarf', { x: 5, y: 8 }, 'earth');
    state = toAction(state);
    const card = give(state, 'earth', 'stoneskin');
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'earth',
      cardId: card,
      targetId: dwarf.id,
    });
    const mod = next.units.find((u) => u.id === dwarf.id)!.statuses.find((s) => s.kind === 'defMod');
    expect(mod?.amount).toBe(2);
  });

  it('Rampart blocks a tile until the Terrain Phase clears it', () => {
    let state = newGame(['earth']);
    state = toAction(state);
    const card = give(state, 'earth', 'rampart');
    const pos = { x: 5, y: 8 };
    const { state: next } = applyAction(state, {
      type: 'playPower',
      guardian: 'earth',
      cardId: card,
      pos,
    });
    expect(next.tiles[idx(next, pos)]!.blockedUntilRound).toBe(next.round);
    // After the full round resolves (Terrain Phase runs), the block is gone.
    const after = applyAction(next, { type: 'endPhase' }).state;
    if (after.result === 'ongoing') {
      expect(after.tiles[idx(after, pos)]!.blockedUntilRound).toBe(-1);
    }
  });

  it('Prism has no standalone effect', () => {
    let state = newGame(['fire']);
    state = toAction(state);
    const card = give(state, 'fire', 'prism');
    expect(() =>
      applyAction(state, { type: 'playPower', guardian: 'fire', cardId: card }),
    ).toThrow(/cannot be played on its own/);
  });
});

describe('statuses', () => {
  it('Burn ticks 1 at cleanup then falls off', () => {
    let state = newGame(['fire'], 21);
    const golem = place(state, 'corrupted-golem', { x: 0, y: 5 }); // HP 3, far away
    golem.statuses.push({
      kind: 'burn', amount: 0, startsRound: state.round, expiresRound: state.round, source: 'test',
    });
    state = toAction(state);
    const next = applyAction(state, { type: 'endPhase' }).state; // evil+terrain+cleanup
    const after = next.units.find((u) => u.id === golem.id)!;
    expect(after.hp).toBeLessThanOrEqual(2); // burn tick (terrain may add more)
    expect(after.statuses.some((s) => s.kind === 'burn')).toBe(false);
  });

  it('Rooted forces MOV 0', async () => {
    const { effectiveMov } = await import('../stats');
    const state = newGame(['fire']);
    const ogre = place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire');
    ogre.statuses.push({
      kind: 'rooted', amount: 0, startsRound: state.round, expiresRound: state.round, source: 'test',
    });
    expect(effectiveMov(state, ogre)).toBe(0);
  });

  it('auras: Fire Fairy Kindle and Water Golem Bulwark', async () => {
    const { effectiveAtk, effectiveDef } = await import('../stats');
    const { unitDef } = await import('../../data/units');
    const state = newGame(['fire', 'water']);
    const goblin = place(state, 'fire-goblin', { x: 5, y: 8 }, 'fire');
    place(state, 'fire-fairy', { x: 5, y: 7 }, 'fire');
    expect(effectiveAtk(state, goblin)).toBe(unitDef('fire-goblin').atk + 1);

    const naiad = place(state, 'water-naiad', { x: 2, y: 8 }, 'water');
    place(state, 'water-golem', { x: 2, y: 7 }, 'water');
    expect(effectiveDef(state, naiad)).toBe(unitDef('water-naiad').def + 1);
  });

  it('support: Naiad heals instead of attacking', () => {
    let state = newGame(['water']);
    const naiad = place(state, 'water-naiad', { x: 5, y: 8 }, 'water');
    const hurt = place(state, 'water-golem', { x: 5, y: 7 }, 'water');
    hurt.hp = 1;
    state = toAction(state);
    const { state: next } = applyAction(state, {
      type: 'support',
      unitId: naiad.id,
      targetId: hurt.id,
    });
    expect(next.units.find((u) => u.id === hurt.id)!.hp).toBe(2);
    const actor = next.units.find((u) => u.id === naiad.id)!;
    expect(actor.attacksUsed).toBe(1);
  });

  it('support: Priest cleanses one status and heals 1', () => {
    let state = newGame(['water']);
    const priest = place(state, 'water-priest', { x: 5, y: 8 }, 'water');
    const ally = place(state, 'water-golem', { x: 5, y: 7 }, 'water');
    ally.hp = 2;
    ally.statuses.push({
      kind: 'burn', amount: 0, startsRound: state.round, expiresRound: state.round, source: 'test',
    });
    state = toAction(state);
    const { state: next } = applyAction(state, {
      type: 'support',
      unitId: priest.id,
      targetId: ally.id,
    });
    const healed = next.units.find((u) => u.id === ally.id)!;
    expect(healed.statuses.length).toBe(0);
    expect(healed.hp).toBe(3);
  });
});
