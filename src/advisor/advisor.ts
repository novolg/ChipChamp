import type { ActionType, GameState } from '../engine/types';
import { Street } from '../engine/types';
import { getLegalActions, getSeat } from '../engine/betting';
import { evaluateHand, HandCategory } from '../engine/evaluator';
import {
  chenScore,
  chenTier,
  detectDraws,
  estimateEquity,
  handStrengthLabel,
  madeStrengthBucket,
  potOdds,
  opponentsInHand,
} from '../engine/strength';

export interface Advice {
  handStrengthLabel: string;
  handCategory: HandCategory | null;
  equityEstimate: number;
  potOdds: number;
  suggestedAction: ActionType;
  suggestedAmount?: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  detail: string[];
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * Produce coaching advice for the seat to act. Unlike the bot, the advisor is
 * deterministic, conservative, and verbose — it explains the textbook play and
 * always references equity and pot odds so the rail is educational.
 */
export function advise(state: GameState, seatId: number): Advice {
  const seat = getSeat(state, seatId);
  const opponents = opponentsInHand(state, seatId);
  const equity = estimateEquity(seat.holeCards, state.board, opponents);
  const odds = potOdds(state, seatId);
  const toCall = state.currentBet - seat.committedThisStreet;
  const legal = getLegalActions(state).map((a) => a.type);
  const canCheck = legal.includes('check');

  const label = handStrengthLabel(seat.holeCards, state.board);
  const handCategory =
    state.board.length >= 3 ? evaluateHand(seat.holeCards, state.board).category : null;

  const detail: string[] = [`Hand: ${label}`, `Estimated equity: ~${pct(equity)}`];
  if (toCall > 0) detail.push(`Pot odds: you need ~${pct(odds)} to call`);

  let suggestedAction: ActionType;
  let reasoning: string;
  let confidence: Advice['confidence'] = 'medium';

  if (state.street === Street.Preflop) {
    const tier = chenTier(chenScore(seat.holeCards));
    detail.push(`Starting hand tier: ${tier}`);
    if (tier === 'premium' || tier === 'strong') {
      suggestedAction = toCall > 0 && legal.includes('raise') ? 'raise' : legal.includes('bet') ? 'bet' : 'call';
      reasoning = `${label} is a ${tier} starting hand — raise to build the pot and take the lead.`;
      confidence = 'high';
    } else if (tier === 'playable') {
      if (toCall === 0) {
        suggestedAction = canCheck ? 'check' : 'call';
        reasoning = `${label} is playable — see a cheap flop.`;
      } else if (toCall <= state.bigBlind) {
        suggestedAction = 'call';
        reasoning = `${label} is playable and the price is small — calling is fine.`;
      } else {
        suggestedAction = 'fold';
        reasoning = `${label} is only playable; facing a raise this big, folding is cleaner.`;
      }
    } else {
      suggestedAction = canCheck ? 'check' : 'fold';
      reasoning =
        suggestedAction === 'check'
          ? `${label} is weak, but checking is free — take the flop.`
          : `${label} is below a profitable calling range here — fold and wait for a better spot.`;
      confidence = 'high';
    }
  } else {
    const bucket = madeStrengthBucket(seat.holeCards, state.board);
    const draws = detectDraws(seat.holeCards, state.board);
    // Only surface draw outs when the hand isn't already a strong made hand —
    // otherwise the rail contradicts its own "bet for value" advice.
    if (draws.outs > 0 && bucket !== 'strong') detail.push(`Draw: ~${draws.outs} outs (${draws.openEnded ? 'open-ended' : draws.gutshot ? 'gutshot' : 'flush'})`);

    if (bucket === 'strong') {
      suggestedAction = toCall > 0 ? (legal.includes('raise') ? 'raise' : 'call') : legal.includes('bet') ? 'bet' : 'check';
      reasoning = `${label} is a strong made hand — bet or raise for value.`;
      confidence = 'high';
    } else if (bucket === 'medium') {
      if (toCall === 0) {
        suggestedAction = legal.includes('bet') ? 'bet' : 'check';
        reasoning = `${label} is decent — a small value bet protects it; checking is also reasonable.`;
      } else if (equity > odds) {
        suggestedAction = 'call';
        reasoning = `You have ~${pct(equity)} equity but only need ~${pct(odds)} to call — calling is profitable.`;
      } else {
        suggestedAction = 'fold';
        reasoning = `Your ~${pct(equity)} equity is below the ~${pct(odds)} the pot is offering — fold.`;
      }
    } else if (bucket === 'draw') {
      if (toCall === 0) {
        suggestedAction = canCheck ? 'check' : 'call';
        reasoning = `You're on a draw (~${draws.outs} outs). Take the free card; a semi-bluff bet is an aggressive alternative.`;
      } else if (equity > odds) {
        suggestedAction = 'call';
        reasoning = `Your draw is ~${pct(equity)} to get there and you only need ~${pct(odds)} — call and chase it.`;
      } else {
        suggestedAction = 'fold';
        reasoning = `The draw is ~${pct(equity)} but the pot only offers ~${pct(odds)} — the price is too high, fold.`;
        confidence = 'low';
      }
    } else {
      suggestedAction = canCheck ? 'check' : 'fold';
      reasoning =
        suggestedAction === 'check'
          ? `${label} has little value — check and see what develops.`
          : `${label} can't profitably continue here — fold.`;
      confidence = toCall > 0 ? 'high' : 'medium';
    }
  }

  const suggestedAmount = computeSuggestedAmount(state, seatId, suggestedAction);

  return {
    handStrengthLabel: label,
    handCategory,
    equityEstimate: equity,
    potOdds: odds,
    suggestedAction,
    suggestedAmount,
    confidence,
    reasoning,
    detail,
  };
}

function computeSuggestedAmount(
  state: GameState,
  seatId: number,
  action: ActionType,
): number | undefined {
  const legal = getLegalActions(state);
  const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  if (action === 'bet') {
    const bet = legal.find((a) => a.type === 'bet');
    if (!bet) return undefined;
    return clamp(Math.round(pot * 0.6), bet.min ?? 0, bet.max ?? 0);
  }
  if (action === 'raise') {
    const raise = legal.find((a) => a.type === 'raise');
    if (!raise) return undefined;
    return clamp(state.currentBet + Math.round(pot * 0.6), raise.min ?? 0, raise.max ?? 0);
  }
  if (action === 'call') {
    const seat = getSeat(state, seatId);
    return Math.min(state.currentBet - seat.committedThisStreet, seat.stack);
  }
  return undefined;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
