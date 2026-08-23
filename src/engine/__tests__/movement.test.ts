import { describe, expect, it } from 'vitest';
import { applyAction, IllegalActionError } from '../reducer';
import { idx, reachableTiles } from '../board';
import { god, newGame, place } from './helpers';

function toActionPhase(state: ReturnType<typeof newGame>) {
  return applyAction(state, { type: 'endPhase' }).state;
}

describe('movement', () => {
  it('moves a unit within its MOV via BFS', () => {
    let state = newGame(['fire']);
    place(state, 'fire-fairy', { x: 5, y: 8 }, 'fire'); // MOV 3
    state = toActionPhase(state);
    const fairy = state.units.find((u) => u.defId === 'fire-fairy')!;
    const { state: next } = applyAction(state, {
      type: 'move',
      unitId: fairy.id,
      to: { x: 5, y: 5 },
    });
    const moved = next.units.find((u) => u.id === fairy.id)!;
    expect(moved.pos).toEqual({ x: 5, y: 5 });
    expect(moved.tilesMovedThisTurn).toBe(3);
  });

  it('rejects destinations beyond MOV', () => {
    let state = newGame(['fire']);
    place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire'); // MOV 1
    state = toActionPhase(state);
    const ogre = state.units.find((u) => u.defId === 'fire-ogre')!;
    expect(() =>
      applyAction(state, { type: 'move', unitId: ogre.id, to: { x: 5, y: 6 } }),
    ).toThrow(IllegalActionError);
  });

  it('ground units path around blockers; flyers pass over', () => {
    const state = newGame(['fire']);
    // Wall of imps across x=4..6 at y=7; mover at (5,8).
    place(state, 'shadow-imp', { x: 4, y: 7 });
    place(state, 'shadow-imp', { x: 5, y: 7 });
    place(state, 'shadow-imp', { x: 6, y: 7 });

    const walker = place(state, 'fire-goblin', { x: 5, y: 8 }, 'fire'); // MOV 2
    const flyer = place(state, 'wind-griffin', { x: 5, y: 8 }, 'fire'); // MOV 4, flying
    // Direct hop over the wall: (5,6) is 2 steps straight up.
    const walkTiles = reachableTiles(state, walker.pos, 2, false).map((t) => idx(state, t.pos));
    expect(walkTiles).not.toContain(idx(state, { x: 5, y: 6 }));
    const flyTiles = reachableTiles(state, flyer.pos, 2, true).map((t) => idx(state, t.pos));
    expect(flyTiles).toContain(idx(state, { x: 5, y: 6 }));
  });

  it('a unit cannot move twice or move after attacking', () => {
    let state = newGame(['fire']);
    place(state, 'fire-fairy', { x: 5, y: 8 }, 'fire');
    state = toActionPhase(state);
    const fairy = state.units.find((u) => u.defId === 'fire-fairy')!;
    let result = applyAction(state, { type: 'move', unitId: fairy.id, to: { x: 5, y: 7 } });
    expect(() =>
      applyAction(result.state, { type: 'move', unitId: fairy.id, to: { x: 5, y: 6 } }),
    ).toThrow(/already moved/);
  });

  it('gods can move 1 tile', () => {
    let state = newGame(['fire']);
    state = toActionPhase(state);
    const fireGod = god(state, 'fire');
    const { state: next } = applyAction(state, {
      type: 'move',
      unitId: fireGod.id,
      to: { x: fireGod.pos.x, y: fireGod.pos.y - 1 },
    });
    expect(next.units.find((u) => u.id === fireGod.id)!.pos.y).toBe(fireGod.pos.y - 1);
  });
});

describe('attack limits', () => {
  it('a normal unit attacks once per Action Phase', () => {
    let state = newGame(['fire']);
    place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire');
    place(state, 'corrupted-golem', { x: 5, y: 7 });
    place(state, 'corrupted-golem', { x: 4, y: 8 });
    state = toActionPhase(state);
    const ogre = state.units.find((u) => u.defId === 'fire-ogre')!;
    const golems = state.units.filter((u) => u.defId === 'corrupted-golem');
    const afterFirst = applyAction(state, {
      type: 'attack',
      attackerId: ogre.id,
      targetId: golems[0]!.id,
    }).state;
    expect(() =>
      applyAction(afterFirst, { type: 'attack', attackerId: ogre.id, targetId: golems[1]!.id }),
    ).toThrow(/no attacks left/);
  });

  it('Fire Imp may attack twice', () => {
    let state = newGame(['fire']);
    place(state, 'fire-imp', { x: 5, y: 8 }, 'fire');
    place(state, 'corrupted-golem', { x: 5, y: 7 });
    state = toActionPhase(state);
    const imp = state.units.find((u) => u.defId === 'fire-imp')!;
    const golem = state.units.find((u) => u.defId === 'corrupted-golem')!;
    let s = applyAction(state, { type: 'attack', attackerId: imp.id, targetId: golem.id }).state;
    const impAfter = s.units.find((u) => u.id === imp.id)!;
    if (impAfter.hp > 0) {
      // Second swing is legal (throws would fail the test).
      applyAction(s, { type: 'attack', attackerId: imp.id, targetId: golem.id });
    }
  });

  it('rejects attacks out of range', () => {
    let state = newGame(['fire']);
    place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire');
    place(state, 'shadow-imp', { x: 5, y: 5 });
    state = toActionPhase(state);
    const ogre = state.units.find((u) => u.defId === 'fire-ogre')!;
    const imp = state.units.find((u) => u.defId === 'shadow-imp')!;
    expect(() =>
      applyAction(state, { type: 'attack', attackerId: ogre.id, targetId: imp.id }),
    ).toThrow(/out of range/);
  });
});
