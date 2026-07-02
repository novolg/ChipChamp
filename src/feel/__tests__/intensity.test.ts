import { describe, it, expect } from 'vitest';
import { intensityFor, payoutTier } from '../intensity';
import type { FeelEvent } from '../events';
import type { GameState } from '../../engine/types';
import { Street } from '../../engine/types';

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

describe('intensityFor', () => {
  const mockGameState = (bigBlind = 20, potAmount = 0): GameState => ({
    seats: [
      {
        id: 1,
        name: 'Hero',
        isHuman: true,
        stack: 1000,
        holeCards: [],
        committedThisStreet: 0,
        committedTotal: 0,
        status: 'active',
        hasActedThisStreet: false,
      },
      {
        id: 2,
        name: 'Villain',
        isHuman: false,
        stack: 1000,
        holeCards: [],
        committedThisStreet: 0,
        committedTotal: 0,
        status: 'active',
        hasActedThisStreet: false,
      },
    ],
    buttonSeatId: 1,
    smallBlind: bigBlind / 2,
    bigBlind,
    street: Street.Preflop,
    board: [],
    deck: [],
    pots: potAmount > 0 ? [{ amount: potAmount, eligibleSeatIds: [1, 2] }] : [],
    toActSeatId: null,
    currentBet: 0,
    minRaise: 0,
    lastAggressorSeatId: null,
    lastFullRaiseLevel: 0,
    rngState: 0,
    handNumber: 1,
    log: [],
    phase: 'betting',
  });

  it('WIN with monster tier → value 1', () => {
    const event: FeelEvent = {
      type: 'WIN',
      heroWon: true,
      amount: 900, // 45 * 20 = 900 chips → monster tier
      winnerSlot: 'hero',
    };
    const game = mockGameState(20);
    const result = intensityFor(event, game);
    expect(result.value).toBe(1);
    expect(result.tier).toBe('monster');
  });

  it('ACTION raise 30BB caps at 1', () => {
    const event: FeelEvent = {
      type: 'ACTION',
      action: 'raise',
      seatId: 2,
      slot: 'left',
      amountBB: 30, // min(1, 30/25) floored at .2 = min(1, 1.2) = 1
    };
    const game = mockGameState(20);
    const result = intensityFor(event, game);
    expect(result.value).toBe(1);
    expect(result.tier).toBe('small');
  });

  it('ACTION check → .15', () => {
    const event: FeelEvent = {
      type: 'ACTION',
      action: 'check',
      seatId: 2,
      slot: 'left',
      amountBB: 0,
    };
    const game = mockGameState(20);
    const result = intensityFor(event, game);
    expect(result.value).toBe(0.15);
    expect(result.tier).toBe('small');
  });
});
