import { describe, it, expect } from 'vitest';
import { chipBreakdown } from '../assets';

describe('chipBreakdown', () => {
  it('greedily picks largest denominations first', () => {
    expect(chipBreakdown(235)).toEqual([
      { denom: 100, count: 2 },
      { denom: 25, count: 1 },
      { denom: 10, count: 1 },
    ]);
  });

  it('returns an empty breakdown for zero', () => {
    expect(chipBreakdown(0)).toEqual([]);
  });

  it('falls through to the smallest denomination', () => {
    expect(chipBreakdown(3)).toEqual([{ denom: 1, count: 3 }]);
  });

  it('never emits a zero-count entry for an exact denomination', () => {
    expect(chipBreakdown(10)).toEqual([{ denom: 10, count: 1 }]);
  });

  it('handles a large realistic pot (multiples of the top denomination only)', () => {
    expect(chipBreakdown(1000)).toEqual([{ denom: 100, count: 10 }]);
  });

  it('mixes every denomination when the amount demands it', () => {
    expect(chipBreakdown(141)).toEqual([
      { denom: 100, count: 1 },
      { denom: 25, count: 1 },
      { denom: 10, count: 1 },
      { denom: 5, count: 1 },
      { denom: 1, count: 1 },
    ]);
  });
});
