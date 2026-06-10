// Shared hand-strength helpers used by both the bot (to decide) and the advisor
// (to explain). Pure functions, no UI. Deliberately simple and teachable rather
// than a full equity solver.

import type { Card, GameState } from './types';
import { evaluateHand, HandCategory, rankLabel } from './evaluator';

/** Chen formula card value. A=10, K=8, Q=7, J=6, otherwise rank/2. */
function chenCardValue(rank: number): number {
  if (rank === 14) return 10;
  if (rank === 13) return 8;
  if (rank === 12) return 7;
  if (rank === 11) return 6;
  return rank / 2;
}

/** Chen formula preflop hand score (higher = stronger starting hand). */
export function chenScore(holeCards: Card[]): number {
  if (holeCards.length !== 2) throw new Error('chenScore needs exactly 2 hole cards');
  const [a, b] = [...holeCards].sort((x, y) => y.rank - x.rank);
  const highValue = chenCardValue(a.rank);

  // Pair: highest card value × 2, minimum 5.
  if (a.rank === b.rank) {
    return Math.round(Math.max(highValue * 2, 5));
  }

  let score = highValue;
  if (a.suit === b.suit) score += 2;

  const gap = a.rank - b.rank - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;

  // Straight bonus for connectors/one-gappers both below queen.
  if ((gap === 0 || gap === 1) && a.rank < 12) score += 1;

  return Math.round(Math.max(score, 0));
}

export type ChenTier = 'premium' | 'strong' | 'playable' | 'marginal' | 'trash';

export function chenTier(score: number): ChenTier {
  if (score >= 10) return 'premium';
  if (score >= 8) return 'strong';
  if (score >= 5) return 'playable';
  if (score >= 3) return 'marginal';
  return 'trash';
}

export interface DrawInfo {
  flushDraw: boolean;
  openEnded: boolean;
  gutshot: boolean;
  /** Approximate number of outs to improve (rule-of-2-and-4 friendly). */
  outs: number;
}

/** Detect flush/straight draws from hole cards + board (postflop only). */
export function detectDraws(holeCards: Card[], board: Card[]): DrawInfo {
  const cards = [...holeCards, ...board];
  if (board.length < 3) return { flushDraw: false, openEnded: false, gutshot: false, outs: 0 };

  // Flush draw: exactly 4 of one suit (5 = made flush, not a draw).
  const suitCounts = new Map<string, number>();
  for (const c of cards) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  const flushDraw = [...suitCounts.values()].some((n) => n === 4);

  // Straight draw: which ranks would complete a 5-card straight?
  const present = new Set<number>(cards.map((c) => c.rank));
  if (present.has(14)) present.add(1); // ace can be low
  const completing: number[] = [];
  for (let v = 1; v <= 14; v++) {
    if (present.has(v)) continue;
    present.add(v);
    if (hasFiveConsecutive(present)) completing.push(v);
    present.delete(v);
  }
  const openEnded = completing.length >= 2;
  const gutshot = completing.length === 1;

  let outs = 0;
  if (flushDraw) outs += 9;
  if (openEnded) outs += 8;
  else if (gutshot) outs += 4;
  // Rough overlap correction when chasing both a flush and a straight.
  if (flushDraw && (openEnded || gutshot)) outs -= 2;

  return { flushDraw, openEnded, gutshot, outs: Math.max(0, outs) };
}

function hasFiveConsecutive(present: Set<number>): boolean {
  for (let start = 1; start <= 10; start++) {
    let all = true;
    for (let k = 0; k < 5; k++) {
      if (!present.has(start + k)) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

export type StrengthBucket = 'strong' | 'medium' | 'draw' | 'weak';

/** Coarse made-hand bucket (postflop) combining category and draws. */
export function madeStrengthBucket(holeCards: Card[], board: Card[]): StrengthBucket {
  const rank = evaluateHand(holeCards, board);
  if (rank.category >= HandCategory.TwoPair) return 'strong';

  if (rank.category === HandCategory.Pair) {
    const pairRank = rank.tiebreakers[0];
    const maxBoard = Math.max(...board.map((c) => c.rank));
    if (pairRank >= maxBoard) return 'medium'; // top pair or overpair
  }

  const draws = detectDraws(holeCards, board);
  if (draws.outs >= 8) return 'draw';

  return 'weak';
}

const CATEGORY_EQUITY: Record<HandCategory, number> = {
  [HandCategory.HighCard]: 0.12,
  [HandCategory.Pair]: 0.42,
  [HandCategory.TwoPair]: 0.62,
  [HandCategory.ThreeOfAKind]: 0.78,
  [HandCategory.Straight]: 0.85,
  [HandCategory.Flush]: 0.9,
  [HandCategory.FullHouse]: 0.94,
  [HandCategory.FourOfAKind]: 0.98,
  [HandCategory.StraightFlush]: 0.99,
};

const PREFLOP_TIER_EQUITY: Record<ChenTier, number> = {
  premium: 0.68,
  strong: 0.56,
  playable: 0.47,
  marginal: 0.4,
  trash: 0.3,
};

/**
 * Cheap heuristic win-probability estimate in [0, 1]. Preflop uses Chen tiers;
 * postflop blends made-hand category with rule-of-2-and-4 draw equity. Adjusted
 * down for additional opponents. Not a Monte Carlo simulation.
 */
export function estimateEquity(
  holeCards: Card[],
  board: Card[],
  numOpponents: number,
): number {
  let base: number;
  if (board.length === 0) {
    base = PREFLOP_TIER_EQUITY[chenTier(chenScore(holeCards))];
  } else {
    const rank = evaluateHand(holeCards, board);
    const made = CATEGORY_EQUITY[rank.category];
    const draws = detectDraws(holeCards, board);
    const perCard = board.length === 3 ? 4 : 2; // rule of 2 and 4
    const drawEquity = Math.min(draws.outs * perCard, 60) / 100;
    base = Math.max(made, rank.category <= HandCategory.Pair ? drawEquity : made);
  }
  const oppFactor = Math.pow(0.92, Math.max(0, numOpponents - 1));
  return clamp(base * oppFactor, 0.02, 0.99);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Human-readable label for the player's current hand (for coaching). */
export function handStrengthLabel(holeCards: Card[], board: Card[]): string {
  if (holeCards.length < 2) return 'No cards';

  if (board.length === 0) {
    const [a, b] = [...holeCards].sort((x, y) => y.rank - x.rank);
    if (a.rank === b.rank) return `Pocket ${rankLabel(a.rank)}s`;
    const suited = a.suit === b.suit ? 'suited' : 'offsuit';
    return `${rankLabel(a.rank)}-${rankLabel(b.rank)} ${suited}`;
  }

  const rank = evaluateHand(holeCards, board);
  if (rank.category === HandCategory.Pair) {
    const pairRank = rank.tiebreakers[0];
    const maxBoard = Math.max(...board.map((c) => c.rank));
    if (pairRank > maxBoard) return 'Overpair';
    if (pairRank === maxBoard) return 'Top pair';
    const minBoard = Math.min(...board.map((c) => c.rank));
    if (pairRank <= minBoard) return 'Bottom pair';
    return 'Middle pair';
  }

  const labels: Record<HandCategory, string> = {
    [HandCategory.HighCard]: 'High card',
    [HandCategory.Pair]: 'Pair',
    [HandCategory.TwoPair]: 'Two pair',
    [HandCategory.ThreeOfAKind]: 'Three of a kind',
    [HandCategory.Straight]: 'Straight',
    [HandCategory.Flush]: 'Flush',
    [HandCategory.FullHouse]: 'Full house',
    [HandCategory.FourOfAKind]: 'Four of a kind',
    [HandCategory.StraightFlush]: 'Straight flush',
  };
  return labels[rank.category];
}

/** Pot odds for the seat to act: callCost / (pot + callCost). 0 if nothing to call. */
export function potOdds(state: GameState, seatId: number): number {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return 0;
  const toCall = state.currentBet - seat.committedThisStreet;
  if (toCall <= 0) return 0;
  const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  return toCall / (pot + toCall);
}

/** Count opponents still contesting the pot (excluding the given seat). */
export function opponentsInHand(state: GameState, seatId: number): number {
  return state.seats.filter(
    (s) => s.id !== seatId && (s.status === 'active' || s.status === 'allin'),
  ).length;
}

/** Relative position in [0, 1]; 1 = button (acts last postflop), 0 = first to act. */
export function positionFactor(state: GameState, seatId: number): number {
  const inHand = state.seats.filter((s) => s.status !== 'out');
  const n = inHand.length;
  if (n <= 1) return 1;
  const btnIdx = inHand.findIndex((s) => s.id === state.buttonSeatId);
  const myIdx = inHand.findIndex((s) => s.id === seatId);
  // Distance going clockwise from the seat left of the button (first) to button (last).
  const fromFirst = (myIdx - (btnIdx + 1) + n) % n;
  return fromFirst / (n - 1);
}
