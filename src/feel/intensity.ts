// Derives a single "intensity" value (0..1) + payout tier from each FeelEvent,
// used to parameterize SFX (volume, pitch, count). Pure functions — no React,
// no randomness, no Date.

import type { FeelEvent } from './events';
import type { GameState } from '../engine/types';

export type PayoutTier = 'small' | 'medium' | 'big' | 'monster';

/** Bucket a won pot (in chips) into a reward tier by its size in big blinds.
 *  Discrete on purpose: replay-stable and instantly recognizable. */
export function payoutTier(amount: number, bb: number): PayoutTier {
  if (bb <= 0 || amount <= 0) return 'small';
  const x = amount / bb;
  if (x >= 45) return 'monster';
  if (x >= 20) return 'big';
  if (x >= 8) return 'medium';
  return 'small';
}

export interface Intensity {
  value: number;
  tier: PayoutTier;
}

export function intensityFor(e: FeelEvent, game: GameState): Intensity {
  switch (e.type) {
    case 'WIN': {
      const tier = payoutTier(e.amount, game.bigBlind);
      const valueMap: Record<PayoutTier, number> = {
        small: 0.25,
        medium: 0.5,
        big: 0.75,
        monster: 1,
      };
      return {
        value: valueMap[tier],
        tier,
      };
    }

    case 'ACTION': {
      const tierDefault: PayoutTier = 'small';

      if (e.action === 'allin') {
        return { value: 0.9, tier: tierDefault };
      }

      if (e.action === 'bet' || e.action === 'raise') {
        const scaled = Math.min(1, e.amountBB / 25);
        const value = Math.max(0.2, scaled);
        return { value, tier: tierDefault };
      }

      if (e.action === 'fold' || e.action === 'check' || e.action === 'call') {
        return { value: 0.15, tier: tierDefault };
      }

      // postBlind or unknown action
      return { value: 0.3, tier: tierDefault };
    }

    case 'STREET_REVEAL': {
      const potTotal = game.pots.reduce((s, p) => s + p.amount, 0);
      const potBB = potTotal / game.bigBlind;
      const value = Math.min(1, potBB / 45);
      const tier = payoutTier(potTotal, game.bigBlind);
      return { value, tier };
    }

    default:
      return { value: 0.3, tier: 'small' };
  }
}
