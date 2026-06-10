import { describe, it, expect } from 'vitest';
import {
  score5,
  compareHandRank,
  evaluateBest,
  HandCategory,
} from '../evaluator';
import type { Card } from '../types';

/** Parse "As Kd 5c" style strings into cards for terse test setup. */
function hand(s: string): Card[] {
  const rankMap: Record<string, number> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
  };
  return s.split(/\s+/).map((tok) => ({
    rank: rankMap[tok[0]] as Card['rank'],
    suit: tok[1] as Card['suit'],
  }));
}

describe('score5 categories', () => {
  it('classifies a royal/straight flush', () => {
    expect(score5(hand('As Ks Qs Js Ts')).category).toBe(HandCategory.StraightFlush);
  });
  it('classifies four of a kind', () => {
    expect(score5(hand('9c 9d 9h 9s 2c')).category).toBe(HandCategory.FourOfAKind);
  });
  it('classifies a full house', () => {
    expect(score5(hand('9c 9d 9h 2s 2c')).category).toBe(HandCategory.FullHouse);
  });
  it('classifies a flush', () => {
    expect(score5(hand('As Js 9s 5s 2s')).category).toBe(HandCategory.Flush);
  });
  it('classifies a straight', () => {
    expect(score5(hand('9c 8d 7h 6s 5c')).category).toBe(HandCategory.Straight);
  });
  it('classifies three of a kind', () => {
    expect(score5(hand('9c 9d 9h 5s 2c')).category).toBe(HandCategory.ThreeOfAKind);
  });
  it('classifies two pair', () => {
    expect(score5(hand('9c 9d 5h 5s 2c')).category).toBe(HandCategory.TwoPair);
  });
  it('classifies a pair', () => {
    expect(score5(hand('9c 9d 7h 5s 2c')).category).toBe(HandCategory.Pair);
  });
  it('classifies a high card', () => {
    expect(score5(hand('Ac Jd 9h 5s 2c')).category).toBe(HandCategory.HighCard);
  });
});

describe('straights', () => {
  it('treats A-2-3-4-5 as a 5-high straight (the wheel)', () => {
    const wheel = score5(hand('Ac 2d 3h 4s 5c'));
    expect(wheel.category).toBe(HandCategory.Straight);
    expect(wheel.tiebreakers[0]).toBe(5);
  });

  it('ranks A-high straight above the wheel', () => {
    const broadway = score5(hand('Ac Kd Qh Js Tc'));
    const wheel = score5(hand('Ad 2c 3d 4h 5s'));
    expect(compareHandRank(broadway, wheel)).toBeGreaterThan(0);
  });

  it('A-2-3-4-5 suited is a straight flush, 5-high', () => {
    const sf = score5(hand('As 2s 3s 4s 5s'));
    expect(sf.category).toBe(HandCategory.StraightFlush);
    expect(sf.tiebreakers[0]).toBe(5);
  });
});

describe('comparisons & tiebreakers', () => {
  it('flush beats a straight', () => {
    const flush = score5(hand('As Js 9s 5s 2s'));
    const straight = score5(hand('9c 8d 7h 6s 5c'));
    expect(compareHandRank(flush, straight)).toBeGreaterThan(0);
  });

  it('higher kicker wins with equal pairs', () => {
    const aceKicker = score5(hand('Kc Kd Ah 5s 2c'));
    const queenKicker = score5(hand('Kc Kd Qh 5s 2c'));
    expect(compareHandRank(aceKicker, queenKicker)).toBeGreaterThan(0);
  });

  it('higher two pair wins', () => {
    const aces = score5(hand('Ac Ad 5h 5s 2c'));
    const kings = score5(hand('Kc Kd 5h 5s 2c'));
    expect(compareHandRank(aces, kings)).toBeGreaterThan(0);
  });

  it('full house compares trips first', () => {
    const aaakk = score5(hand('Ac Ad Ah Ks Kc'));
    const kkkaa = score5(hand('Kc Kd Kh As Ac'));
    expect(compareHandRank(aaakk, kkkaa)).toBeGreaterThan(0);
  });

  it('identical hands tie (split pot)', () => {
    const a = score5(hand('Ac Kd Qh Js 9c'));
    const b = score5(hand('Ad Kh Qs Jc 9d'));
    expect(compareHandRank(a, b)).toBe(0);
  });
});

describe('evaluateBest (5 of 7)', () => {
  it('finds the best 5-card hand from 7 cards', () => {
    // Hole As Ks, board Qs Js Ts 2c 3d → royal flush
    const best = evaluateBest(hand('As Ks Qs Js Ts 2c 3d'));
    expect(best.category).toBe(HandCategory.StraightFlush);
    expect(best.tiebreakers[0]).toBe(14);
  });

  it('uses the board when it plays (hole cards do not improve it)', () => {
    // Board is a straight 9-K; hole 2c 3d contributes nothing.
    const best = evaluateBest(hand('2c 3d Kh Qc Js Th 9d'));
    expect(best.category).toBe(HandCategory.Straight);
    expect(best.tiebreakers[0]).toBe(13);
  });

  it('picks trips over a lower two pair when both are available', () => {
    const best = evaluateBest(hand('9c 9d 9h 5s 5c 2d 3h'));
    expect(best.category).toBe(HandCategory.FullHouse);
  });
});
