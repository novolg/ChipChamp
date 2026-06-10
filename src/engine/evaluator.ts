import type { Card, Rank } from './types';

/** Hand categories ordered low→high so numeric comparison ranks them correctly. */
export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const HAND_CATEGORY_LABEL: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

export interface HandRank {
  category: HandCategory;
  /** Tiebreak ranks in descending priority; same length for a given category. */
  tiebreakers: number[];
  /** The exact 5 cards forming this hand (for UI highlight). */
  cards: Card[];
}

/** Detect a straight from 5 DISTINCT sorted-desc ranks. Returns the straight's
 *  high card, or 0 if not a straight. Handles the ace-low wheel (A-2-3-4-5). */
function straightHigh(distinctDesc: number[]): number {
  if (distinctDesc.length !== 5) return 0;
  // Wheel: A,5,4,3,2 → 5-high straight.
  if (
    distinctDesc[0] === 14 &&
    distinctDesc[1] === 5 &&
    distinctDesc[2] === 4 &&
    distinctDesc[3] === 3 &&
    distinctDesc[4] === 2
  ) {
    return 5;
  }
  if (distinctDesc[0] - distinctDesc[4] === 4) {
    return distinctDesc[0];
  }
  return 0;
}

/** Score exactly 5 cards into a comparable HandRank. */
export function score5(cards: Card[]): HandRank {
  if (cards.length !== 5) {
    throw new Error(`score5 expects 5 cards, got ${cards.length}`);
  }

  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  // Count occurrences of each rank.
  const countByRank = new Map<number, number>();
  for (const r of ranks) countByRank.set(r, (countByRank.get(r) ?? 0) + 1);

  // Groups sorted by (count desc, rank desc) — drives tiebreakers for paired hands.
  const groups = [...countByRank.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  const pattern = groups.map((g) => g[1]); // e.g. [4,1], [3,2], [2,2,1]

  const distinctDesc = groups.map((g) => g[0]).sort((a, b) => b - a);
  const sHigh = pattern.length === 5 ? straightHigh(distinctDesc) : 0;
  const isStraight = sHigh > 0;

  let category: HandCategory;
  let tiebreakers: number[];

  if (isStraight && isFlush) {
    category = HandCategory.StraightFlush;
    tiebreakers = [sHigh];
  } else if (pattern[0] === 4) {
    category = HandCategory.FourOfAKind;
    tiebreakers = [groups[0][0], groups[1][0]]; // quad, kicker
  } else if (pattern[0] === 3 && pattern[1] === 2) {
    category = HandCategory.FullHouse;
    tiebreakers = [groups[0][0], groups[1][0]]; // trips, pair
  } else if (isFlush) {
    category = HandCategory.Flush;
    tiebreakers = ranks.slice(); // all 5 desc
  } else if (isStraight) {
    category = HandCategory.Straight;
    tiebreakers = [sHigh];
  } else if (pattern[0] === 3) {
    category = HandCategory.ThreeOfAKind;
    tiebreakers = [groups[0][0], ...groups.slice(1).map((g) => g[0])]; // trips, kickers desc
  } else if (pattern[0] === 2 && pattern[1] === 2) {
    category = HandCategory.TwoPair;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0]]; // hiPair, loPair, kicker
  } else if (pattern[0] === 2) {
    category = HandCategory.Pair;
    tiebreakers = [groups[0][0], ...groups.slice(1).map((g) => g[0])]; // pair, kickers desc
  } else {
    category = HandCategory.HighCard;
    tiebreakers = ranks.slice();
  }

  return { category, tiebreakers, cards: cards.slice() };
}

/** Compare two hand ranks. Returns >0 if a beats b, <0 if b beats a, 0 if tied. */
export function compareHandRank(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** All k-combinations of indices [0..n). */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];
  const recurse = (start: number): void => {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      recurse(i + 1);
      combo.pop();
    }
  };
  recurse(0);
  return result;
}

/** Best 5-card hand from 5, 6, or 7 cards (enumerates all C(n,5) combos). */
export function evaluateBest(cards: Card[]): HandRank {
  if (cards.length < 5) {
    throw new Error(`evaluateBest needs at least 5 cards, got ${cards.length}`);
  }
  if (cards.length === 5) return score5(cards);

  let best: HandRank | null = null;
  for (const idx of combinations(cards.length, 5)) {
    const hand = score5(idx.map((i) => cards[i]));
    if (best === null || compareHandRank(hand, best) > 0) best = hand;
  }
  return best as HandRank;
}

/** Convenience: evaluate a player's best hand from hole cards + board. */
export function evaluateHand(holeCards: Card[], board: Card[]): HandRank {
  return evaluateBest([...holeCards, ...board]);
}

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    case 10:
      return 'T';
    default:
      return String(rank);
  }
}
