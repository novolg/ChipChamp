import { describe, it, expect } from 'vitest';
import { detectDraws, madeStrengthBucket } from '../strength';
import type { Card } from '../types';

const c = (r: number, s: string): Card => ({ rank: r as Card['rank'], suit: s as Card['suit'] });

describe('detectDraws', () => {
  it('does not report a completed straight as a straight draw', () => {
    // 6-7-8-9-10 is a made (ten-high) straight, not a draw.
    const info = detectDraws([c(6, 'h'), c(7, 'h')], [c(8, 'c'), c(9, 'd'), c(10, 's')]);
    expect(info.openEnded).toBe(false);
    expect(info.gutshot).toBe(false);
    expect(info.outs).toBe(0);
  });

  it('still detects a genuine open-ended straight draw', () => {
    // 6-7-8-9 (four to a straight) completes on a 5 or a 10 → 8 outs.
    const info = detectDraws([c(6, 'h'), c(7, 'c')], [c(8, 'd'), c(9, 's'), c(2, 'c')]);
    expect(info.openEnded).toBe(true);
    expect(info.outs).toBe(8);
  });

  it('still detects a flush draw', () => {
    // Four hearts, one off-suit → 9-out flush draw.
    const info = detectDraws([c(14, 'h'), c(9, 'h')], [c(2, 'h'), c(7, 'h'), c(13, 'c')]);
    expect(info.flushDraw).toBe(true);
    expect(info.outs).toBe(9);
  });
});

describe('madeStrengthBucket', () => {
  it('treats a non-top made pair as medium (so the equity check runs) rather than weak', () => {
    // Middle pair (pair of 9s) on A-9-5 — a made hand, not air.
    expect(madeStrengthBucket([c(9, 'c'), c(4, 'h')], [c(14, 's'), c(9, 'd'), c(5, 'c')])).toBe('medium');
  });
});
