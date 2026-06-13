import { describe, it, expect } from 'vitest';
import { payoutTier } from '../useTableSfx';

describe('payoutTier', () => {
  it('buckets by pot size in big blinds', () => {
    const bb = 20;
    expect(payoutTier(5 * bb, bb)).toBe('small');   // < 8bb
    expect(payoutTier(12 * bb, bb)).toBe('medium');  // 8–20bb
    expect(payoutTier(30 * bb, bb)).toBe('big');     // 20–45bb
    expect(payoutTier(80 * bb, bb)).toBe('monster'); // >= 45bb
  });
  it('clamps and handles zero/garbage bb safely', () => {
    expect(payoutTier(0, 20)).toBe('small');
    expect(payoutTier(1000, 0)).toBe('small'); // bb<=0 → no scaling
  });
});
