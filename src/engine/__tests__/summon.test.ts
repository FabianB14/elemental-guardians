import { describe, expect, it } from 'vitest';
import { applyAction, IllegalActionError } from '../reducer';
import { unitAt } from '../board';
import type { GameState } from '../types';
import { god, guardianOf, newGame } from './helpers';

/** Puts a specific card (by defId) into hand, returning its instance id. */
function rig(state: GameState, element: 'fire', defId: string): string {
  const guardian = guardianOf(state, element);
  let card = guardian.hand.find((c) => c.defId === defId);
  if (!card) {
    const index = guardian.deck.findIndex((c) => c.defId === defId);
    if (index < 0) throw new Error(`No ${defId} left in deck.`);
    card = guardian.deck.splice(index, 1)[0]!;
    guardian.hand.push(card);
  }
  return card.id;
}

describe('summoning', () => {
  it('pays the discard cost and places the unit', () => {
    const state = newGame(['fire']);
    const guardian = guardianOf(state, 'fire');
    const cardId = rig(state, 'fire', 'summon-fire-ogre'); // cost 2
    const discards = guardian.hand.filter((c) => c.id !== cardId).slice(0, 2);
    const handBefore = guardian.hand.length;
    const pos = { x: god(state, 'fire').pos.x, y: god(state, 'fire').pos.y - 1 };

    const { state: next } = applyAction(state, {
      type: 'summon',
      guardian: 'fire',
      cardId,
      discardCardIds: discards.map((c) => c.id),
      pos,
    });

    const nextGuardian = guardianOf(next, 'fire');
    expect(nextGuardian.hand.length).toBe(handBefore - 3); // card + 2 discards
    expect(nextGuardian.discard.length).toBe(3);
    const unit = unitAt(next, pos);
    expect(unit?.defId).toBe('fire-ogre');
    expect(unit?.owner).toBe('fire');
  });

  it('rejects wrong discard counts', () => {
    const state = newGame(['fire']);
    const guardian = guardianOf(state, 'fire');
    const cardId = rig(state, 'fire', 'summon-fire-ogre'); // cost 2
    const discards = guardian.hand.filter((c) => c.id !== cardId).slice(0, 1);
    expect(() =>
      applyAction(state, {
        type: 'summon',
        guardian: 'fire',
        cardId,
        discardCardIds: discards.map((c) => c.id),
        pos: { x: 5, y: 9 },
      }),
    ).toThrow(IllegalActionError);
  });

  it('rejects using the summon card as its own discard', () => {
    const state = newGame(['fire']);
    const guardian = guardianOf(state, 'fire');
    const cardId = rig(state, 'fire', 'summon-fire-fairy'); // cost 1
    expect(() =>
      applyAction(state, {
        type: 'summon',
        guardian: 'fire',
        cardId,
        discardCardIds: [cardId],
        pos: { x: 5, y: 9 },
      }),
    ).toThrow(IllegalActionError);
    void guardian;
  });

  it('rejects placement out of range of god and general', () => {
    const state = newGame(['fire']);
    const guardian = guardianOf(state, 'fire');
    const cardId = rig(state, 'fire', 'summon-fire-fairy');
    const discards = guardian.hand.filter((c) => c.id !== cardId).slice(0, 1);
    expect(() =>
      applyAction(state, {
        type: 'summon',
        guardian: 'fire',
        cardId,
        discardCardIds: discards.map((c) => c.id),
        pos: { x: 0, y: 0 },
      }),
    ).toThrow(/within 2 tiles/);
  });

  it('rejects occupied tiles', () => {
    const state = newGame(['fire']);
    const guardian = guardianOf(state, 'fire');
    const cardId = rig(state, 'fire', 'summon-fire-fairy');
    const discards = guardian.hand.filter((c) => c.id !== cardId).slice(0, 1);
    expect(() =>
      applyAction(state, {
        type: 'summon',
        guardian: 'fire',
        cardId,
        discardCardIds: discards.map((c) => c.id),
        pos: { ...god(state, 'fire').pos },
      }),
    ).toThrow(/occupied/);
  });

  it('only works during the Summon Phase', () => {
    const state = newGame(['fire']);
    const { state: actionPhase } = applyAction(state, { type: 'endPhase' });
    const guardian = guardianOf(actionPhase, 'fire');
    const cardId = guardian.hand.find((c) => c.defId.startsWith('summon-'))!.id;
    expect(() =>
      applyAction(actionPhase, {
        type: 'summon',
        guardian: 'fire',
        cardId,
        discardCardIds: [],
        pos: { x: 5, y: 9 },
      }),
    ).toThrow(/summon phase/);
  });
});
