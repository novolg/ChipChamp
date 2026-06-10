import type { Card, Deck, Rank, Suit } from './types';
import { nextInt } from './rng';

export const SUITS: Suit[] = ['c', 'd', 'h', 's'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** A fresh, ordered 52-card deck. */
export function createDeck(): Deck {
  const deck: Deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle using the seeded RNG. Returns the shuffled deck and the
 *  advanced RNG state so the caller can thread determinism through the game. */
export function shuffle(deck: Deck, rngState: number): [Deck, number] {
  const out = deck.slice();
  let state = rngState;
  for (let i = out.length - 1; i > 0; i--) {
    const [s, j] = nextInt(state, i + 1);
    state = s;
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return [out, state];
}

const SUIT_INDEX: Record<Suit, string> = { c: 'c', d: 'd', h: 'h', s: 's' };

function cardKey(card: Card): string {
  return `${card.rank}${SUIT_INDEX[card.suit]}`;
}

export interface StackedDeckSpec {
  /** Hole cards per seat id, in deal order across seats. */
  holeCards: Record<number, Card[]>;
  /** Seat ids in dealing order (button+1 first, etc.). */
  dealOrder: number[];
  /** Community cards: up to 5 (flop, turn, river). */
  board: Card[];
}

/**
 * Build a deterministic deck that, when dealt by the engine's normal procedure,
 * produces exactly the requested hole cards and board. Used by scripted tutorial
 * hands so the same engine code path runs as in free play.
 *
 * Deal procedure assumed by the engine:
 *   1. Two passes around `dealOrder`, one card each pass (standard deal).
 *   2. Burn? No burns — board cards are taken straight off the top in order.
 * The remaining 52 - used cards are appended (any order) so the deck is full.
 */
export function buildStackedDeck(spec: StackedDeckSpec): Deck {
  const ordered: Card[] = [];

  // Two cards per seat, dealt one-per-seat per pass (round 0 then round 1).
  for (let round = 0; round < 2; round++) {
    for (const seatId of spec.dealOrder) {
      const cards = spec.holeCards[seatId];
      if (!cards || cards.length < 2) {
        throw new Error(`buildStackedDeck: seat ${seatId} needs 2 hole cards`);
      }
      ordered.push(cards[round]);
    }
  }

  // Board cards follow, in order (flop x3, turn, river).
  for (const c of spec.board) ordered.push(c);

  // Fill the rest of the deck with whatever cards remain unused.
  const used = new Set(ordered.map(cardKey));
  for (const c of createDeck()) {
    if (!used.has(cardKey(c))) ordered.push(c);
  }

  if (ordered.length !== 52) {
    throw new Error(
      `buildStackedDeck: produced ${ordered.length} cards (duplicate in spec?)`,
    );
  }
  return ordered;
}
