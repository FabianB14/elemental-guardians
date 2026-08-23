import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from '../rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('d6 stays within 1..6 and hits every face', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const roll = rng.d6();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
      seen.add(roll);
    }
    expect(seen.size).toBe(6);
  });

  it('shuffle is a deterministic permutation', () => {
    const a = new Rng(9).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Rng(9).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('hashes seed strings stably', () => {
    expect(seedFromString('elemental')).toBe(seedFromString('elemental'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
