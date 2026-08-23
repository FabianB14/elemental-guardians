import { describe, expect, it } from 'vitest';
import { botPlay } from '../../sim/bot';
import { createGame } from '../setup';
import type { GameState } from '../types';

function fingerprint(state: GameState): string {
  return JSON.stringify({
    result: state.result,
    round: state.round,
    rng: state.rngState,
    evilAtk: state.evilAtkBonus,
    units: state.units.map((u) => [u.id, u.defId, u.pos.x, u.pos.y, u.hp]),
    hands: state.guardians.map((g) => g.hand.map((c) => c.id)),
    decks: state.guardians.map((g) => g.deck.length),
    doom: state.doomDeck.length,
    stats: state.stats,
  });
}

describe('determinism', () => {
  it('same seed → identical full game', () => {
    const runA = botPlay(createGame({ guardians: ['fire', 'water'], seed: 1234 }));
    const runB = botPlay(createGame({ guardians: ['fire', 'water'], seed: 1234 }));
    expect(runA.result).not.toBe('ongoing');
    expect(fingerprint(runA)).toBe(fingerprint(runB));
  });

  it('different seeds diverge', () => {
    const runA = botPlay(createGame({ guardians: ['fire'], seed: 1 }));
    const runB = botPlay(createGame({ guardians: ['fire'], seed: 2 }));
    expect(fingerprint(runA)).not.toBe(fingerprint(runB));
  });

  it('seeded random maps are reproducible', () => {
    const a = createGame({ guardians: ['earth'], seed: 777, map: 'random' });
    const b = createGame({ guardians: ['earth'], seed: 777, map: 'random' });
    expect(a.tiles.map((t) => t.terrain).join()).toBe(b.tiles.map((t) => t.terrain).join());
  });

  it('applyAction never mutates its input state', () => {
    const state = createGame({ guardians: ['fire'], seed: 55 });
    const snapshot = JSON.stringify(state);
    botPlay(state, 3);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
