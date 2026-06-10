import type { Action, GameState } from '../engine/types';
import { Street } from '../engine/types';
import { getLegalActions, getSeat, type LegalAction } from '../engine/betting';
import { seedFrom, nextRandom } from '../engine/rng';
import {
  chenScore,
  chenTier,
  estimateEquity,
  madeStrengthBucket,
  potOdds,
  opponentsInHand,
  positionFactor,
} from '../engine/strength';
import { BET_FRACTION, DEFAULT_BOT, type BotConfig } from './botConstants';

/**
 * Decide an action for `seatId`. Pure: derives any randomness deterministically
 * from the game state, and always returns an action that is currently legal.
 */
export function decide(state: GameState, seatId: number, config: BotConfig = DEFAULT_BOT): Action {
  const legal = getLegalActions(state);
  if (legal.length === 0) throw new Error(`Seat ${seatId} has no legal actions`);

  const seat = getSeat(state, seatId);
  const rnd = deterministicRandom(state, seatId);
  const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  const toCall = state.currentBet - seat.committedThisStreet;

  let desired: Action;
  if (state.street === Street.Preflop) {
    desired = decidePreflop(state, seatId, config, rnd, pot);
  } else {
    desired = decidePostflop(state, seatId, config, rnd, pot, toCall);
  }

  return coerceLegal(desired, legal, seatId, pot, state);
}

function decidePreflop(
  state: GameState,
  seatId: number,
  config: BotConfig,
  rnd: number,
  pot: number,
): Action {
  const seat = getSeat(state, seatId);
  const score = chenScore(seat.holeCards);
  const tier = chenTier(score + positionFactor(state, seatId) * 2);
  const toCall = state.currentBet - seat.committedThisStreet;

  if (tier === 'premium' || (tier === 'strong' && rnd < 0.6 + config.aggression * 0.3)) {
    return raiseOrBet(state, seatId, pot, BET_FRACTION + 0.2);
  }
  if (tier === 'strong' || tier === 'playable') {
    return toCall > 0 ? { type: 'call', seatId } : { type: 'check', seatId };
  }
  if (tier === 'marginal') {
    // Call only if cheap (limp / in the blind), else fold.
    if (toCall === 0) return { type: 'check', seatId };
    if (toCall <= state.bigBlind) return { type: 'call', seatId };
    return { type: 'fold', seatId };
  }
  // Trash: fold, but occasionally steal from late position.
  if (toCall === 0) return { type: 'check', seatId };
  if (rnd < config.bluffFreq && positionFactor(state, seatId) > 0.7) {
    return raiseOrBet(state, seatId, pot, BET_FRACTION);
  }
  return { type: 'fold', seatId };
}

function decidePostflop(
  state: GameState,
  seatId: number,
  config: BotConfig,
  rnd: number,
  pot: number,
  toCall: number,
): Action {
  const seat = getSeat(state, seatId);
  const bucket = madeStrengthBucket(seat.holeCards, state.board);
  const equity = estimateEquity(seat.holeCards, state.board, opponentsInHand(state, seatId));
  const odds = potOdds(state, seatId);

  if (bucket === 'strong') {
    if (rnd < 0.55 + config.aggression * 0.4) return raiseOrBet(state, seatId, pot, BET_FRACTION);
    return toCall > 0 ? { type: 'call', seatId } : { type: 'check', seatId };
  }

  if (bucket === 'medium') {
    if (toCall === 0 && rnd < config.aggression * 0.5) return raiseOrBet(state, seatId, pot, BET_FRACTION * 0.7);
    if (toCall > 0 && equity > odds) return { type: 'call', seatId };
    return toCall > 0 ? { type: 'fold', seatId } : { type: 'check', seatId };
  }

  if (bucket === 'draw') {
    // Semi-bluff sometimes; otherwise call if the price is right.
    if (toCall === 0 && rnd < config.aggression * 0.6) return raiseOrBet(state, seatId, pot, BET_FRACTION * 0.7);
    if (toCall > 0 && equity > odds) return { type: 'call', seatId };
    return toCall > 0 ? { type: 'fold', seatId } : { type: 'check', seatId };
  }

  // Weak: check, or bluff occasionally in position; never call a bet.
  if (toCall === 0) {
    if (rnd < config.bluffFreq && positionFactor(state, seatId) > 0.6) {
      return raiseOrBet(state, seatId, pot, BET_FRACTION * 0.6);
    }
    return { type: 'check', seatId };
  }
  return { type: 'fold', seatId };
}

/** Build a bet (if no current bet) or raise action sized to a fraction of the pot. */
function raiseOrBet(state: GameState, seatId: number, pot: number, fraction: number): Action {
  const sized = Math.max(state.bigBlind, Math.round(pot * fraction));
  if (state.currentBet === 0) {
    return { type: 'bet', seatId, amount: sized };
  }
  const seat = getSeat(state, seatId);
  const target = state.currentBet + Math.max(state.minRaise, sized);
  return { type: 'raise', seatId, amount: Math.min(target, seat.committedThisStreet + seat.stack) };
}

/**
 * Map a desired action to a legal one. Guarantees the returned action is in the
 * current legal set (clamping sizes and falling back when an option is unavailable).
 */
function coerceLegal(
  desired: Action,
  legal: LegalAction[],
  seatId: number,
  pot: number,
  state: GameState,
): Action {
  void pot;
  const has = (t: LegalAction['type']) => legal.find((a) => a.type === t);

  switch (desired.type) {
    case 'fold':
      return has('check') ? { type: 'check', seatId } : { type: 'fold', seatId };

    case 'check':
      if (has('check')) return { type: 'check', seatId };
      return has('call') ? { type: 'call', seatId } : { type: 'fold', seatId };

    case 'call':
      if (has('call')) return { type: 'call', seatId };
      return has('check') ? { type: 'check', seatId } : { type: 'fold', seatId };

    case 'bet': {
      const bet = has('bet');
      if (bet) {
        const amount = clampTo(desired.amount ?? bet.min ?? 0, bet.min!, bet.max!);
        return { type: 'bet', seatId, amount };
      }
      // Can't open a bet (already a bet outstanding): treat as raise/call.
      return coerceLegal({ type: 'raise', seatId, amount: desired.amount }, legal, seatId, pot, state);
    }

    case 'raise': {
      const raise = has('raise');
      if (raise) {
        const amount = clampTo(desired.amount ?? raise.min ?? 0, raise.min!, raise.max!);
        return { type: 'raise', seatId, amount };
      }
      // Can't make a full raise: go all-in (short raise) if available, else call/check.
      if (has('allin')) return { type: 'allin', seatId };
      if (has('call')) return { type: 'call', seatId };
      return has('check') ? { type: 'check', seatId } : { type: 'fold', seatId };
    }

    case 'allin':
      if (has('allin')) return { type: 'allin', seatId };
      if (has('call')) return { type: 'call', seatId };
      return has('check') ? { type: 'check', seatId } : { type: 'fold', seatId };

    default:
      return { type: 'fold', seatId };
  }
}

function clampTo(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Deterministic pseudo-random in [0,1) seeded by the game state and seat. */
function deterministicRandom(state: GameState, seatId: number): number {
  const seed = seedFrom(`${state.rngState}:${seatId}:${state.street}:${state.board.length}:${state.handNumber}`);
  return nextRandom(seed)[1];
}
