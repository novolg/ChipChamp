import { describe, expect, it } from 'vitest';
import { ODDS_DECISIONS, requiredEquity } from '../potOddsLab';

describe('pot odds lesson', () => {
  it('includes the call exactly once in the final pot', () => {
    expect(requiredEquity(120, 30)).toBe(.2);
    expect(requiredEquity(180, 60)).toBe(.25);
  });
  it('crosses break-even when the opponent bets 40 into 80', () => {
    expect(requiredEquity(80 + 20, 20)).toBeLessThan(.25);
    expect(requiredEquity(80 + 40, 40)).toBe(.25);
    expect(requiredEquity(80 + 60, 60)).toBeGreaterThan(.25);
  });
  it('agrees with the expected value of each supplied decision', () => {
    for (const spot of ODDS_DECISIONS) {
      const callEV = spot.equity * (spot.pot + spot.call) - spot.call;
      expect(callEV > 0 ? 'call' : 'fold').toBe(spot.correct);
    }
  });
  it('handles free checks and rejects invalid amounts', () => {
    expect(requiredEquity(0, 0)).toBe(0);
    expect(() => requiredEquity(-1, 30)).toThrow(RangeError);
    expect(() => requiredEquity(120, NaN)).toThrow(RangeError);
  });
});
