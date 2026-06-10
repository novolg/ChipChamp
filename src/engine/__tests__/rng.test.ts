import { describe, it, expect } from 'vitest';
import { nextRandom, nextInt, seedFrom } from '../rng';

describe('nextRandom', () => {
  it('returns floats in [0, 1)', () => {
    let state = 12345;
    for (let i = 0; i < 1000; i++) {
      const [s, f] = nextRandom(state);
      state = s;
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('is deterministic for a given state', () => {
    expect(nextRandom(7)).toEqual(nextRandom(7));
  });

  it('produces a different value as state advances', () => {
    const [s1, f1] = nextRandom(7);
    const [, f2] = nextRandom(s1);
    expect(f1).not.toBe(f2);
  });
});

describe('nextInt', () => {
  it('returns integers in [0, max)', () => {
    let state = 1;
    for (let i = 0; i < 1000; i++) {
      const [s, n] = nextInt(state, 52);
      state = s;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(52);
    }
  });
});

describe('seedFrom', () => {
  it('is stable for the same input', () => {
    expect(seedFrom('hand-1')).toBe(seedFrom('hand-1'));
    expect(seedFrom(42)).toBe(seedFrom(42));
  });

  it('differs for different inputs', () => {
    expect(seedFrom('hand-1')).not.toBe(seedFrom('hand-2'));
  });
});
