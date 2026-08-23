import { describe, expect, it } from 'vitest';
import { applyAction } from '../reducer';
import { checkDeckOut } from '../phases';
import type { GameEvent, GameState } from '../types';
import { god, guardianOf, newGame, place } from './helpers';

describe('round loop', () => {
  it('summon → action → (evil, terrain) → next round summon', () => {
    const state = newGame(['fire']);
    expect(state.round).toBe(1);
    expect(state.phase).toBe('summon');
    const action = applyAction(state, { type: 'endPhase' }).state;
    expect(action.phase).toBe('action');
    const next = applyAction(action, { type: 'endPhase' }).state;
    // Evil + Terrain resolve automatically; we land in round 2's Summon
    // Phase unless a hand exceeded the limit.
    if (next.phase === 'summon') {
      expect(next.round).toBe(2);
    } else {
      expect(next.phase).toBe('discard');
    }
  });

  it('draws 2 per guardian each new round', () => {
    let state = newGame(['fire'], 7);
    const handBefore = guardianOf(state, 'fire').hand.length;
    const deckBefore = guardianOf(state, 'fire').deck.length;
    state = applyAction(state, { type: 'endPhase' }).state;
    state = applyAction(state, { type: 'endPhase' }).state;
    if (state.phase === 'summon' && state.result === 'ongoing') {
      const guardian = guardianOf(state, 'fire');
      // Hand may also have shrunk from doom effects? No — doom never discards.
      expect(guardian.deck.length).toBe(deckBefore - 2);
      expect(guardian.hand.length).toBe(handBefore + 2);
    }
  });

  it('hand-limit discard phase triggers past 8 cards', () => {
    let state = newGame(['fire'], 11);
    const guardian = guardianOf(state, 'fire');
    // Stuff the hand to 9 before ending the round.
    while (guardian.hand.length < 9 && guardian.deck.length > 0) {
      guardian.hand.push(guardian.deck.shift()!);
    }
    state = applyAction(state, { type: 'endPhase' }).state;
    state = applyAction(state, { type: 'endPhase' }).state;
    if (state.result !== 'ongoing') return; // an unlucky seed can end the game
    expect(state.phase).toBe('discard');
    const over = guardianOf(state, 'fire');
    const toDitch = over.hand.slice(0, over.hand.length - 8).map((c) => c.id);
    state = applyAction(state, {
      type: 'discard',
      guardian: 'fire',
      cardIds: toDitch,
    }).state;
    state = applyAction(state, { type: 'endPhase' }).state;
    expect(['summon', 'gameOver']).toContain(state.phase);
  });
});

describe('deck-out loss', () => {
  function drain(state: GameState) {
    for (const guardian of state.guardians) {
      guardian.deck = [];
      guardian.hand = [];
    }
  }

  it('declares defeat when decks, hands and troops are all gone', () => {
    const state = newGame(['fire']);
    drain(state);
    const events: GameEvent[] = [];
    checkDeckOut(state, events);
    expect(state.result).toBe('defeat');
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('troops on the board stave off deck-out', () => {
    const state = newGame(['fire']);
    drain(state);
    place(state, 'fire-ogre', { x: 5, y: 8 }, 'fire');
    const events: GameEvent[] = [];
    checkDeckOut(state, events);
    expect(state.result).toBe('ongoing');
  });

  it('cards in any living hand stave off deck-out', () => {
    const state = newGame(['fire', 'water'], 3);
    drain(state);
    guardianOf(state, 'water').hand.push({ id: 'x', defId: 'healing-tide' });
    const events: GameEvent[] = [];
    checkDeckOut(state, events);
    expect(state.result).toBe('ongoing');
  });
});

describe('god death', () => {
  it('all guardian gods dead = defeat', () => {
    const state = newGame(['fire']);
    god(state, 'fire').hp = 0;
    const events: GameEvent[] = [];
    // Any victory check will notice.
    const next = applyAction(state, { type: 'endPhase' }).state;
    const after = applyAction(next, { type: 'endPhase' }).state;
    expect(after.result).toBe('defeat');
    void events;
  });

  it('all evil gods dead = victory', () => {
    const state = newGame(['fire']);
    for (const id of state.evilGodIds) {
      state.units.find((u) => u.id === id)!.hp = 0;
    }
    const next = applyAction(state, { type: 'endPhase' }).state;
    const after = applyAction(next, { type: 'endPhase' }).state;
    expect(after.result).toBe('victory');
  });

  it('a dead guardian god stops that guardian drawing', () => {
    let state = newGame(['fire', 'water'], 5);
    god(state, 'fire').hp = 0;
    const fireDeck = guardianOf(state, 'fire').deck.length;
    const fireHand = guardianOf(state, 'fire').hand.length;
    state = applyAction(state, { type: 'endPhase' }).state;
    state = applyAction(state, { type: 'endPhase' }).state;
    if (state.result === 'ongoing' && state.phase === 'summon') {
      expect(guardianOf(state, 'fire').deck.length).toBe(fireDeck);
      expect(guardianOf(state, 'fire').hand.length).toBe(fireHand);
    }
  });
});
