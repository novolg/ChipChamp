import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, buildStackedDeck, RANKS, SUITS } from '../deck';
import type { Card } from '../types';

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

describe('createDeck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey)).size).toBe(52);
  });

  it('covers every rank/suit combination', () => {
    const deck = createDeck();
    for (const r of RANKS) {
      for (const s of SUITS) {
        expect(deck.some((c) => c.rank === r && c.suit === s)).toBe(true);
      }
    }
  });
});

describe('shuffle', () => {
  it('preserves all 52 cards (a permutation)', () => {
    const [shuffled] = shuffle(createDeck(), 12345);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map(cardKey)).size).toBe(52);
  });

  it('is deterministic for a given seed', () => {
    const [a] = shuffle(createDeck(), 999);
    const [b] = shuffle(createDeck(), 999);
    expect(a.map(cardKey)).toEqual(b.map(cardKey));
  });

  it('produces different orders for different seeds', () => {
    const [a] = shuffle(createDeck(), 1);
    const [b] = shuffle(createDeck(), 2);
    expect(a.map(cardKey)).not.toEqual(b.map(cardKey));
  });

  it('advances the rng state', () => {
    const [, state] = shuffle(createDeck(), 42);
    expect(state).not.toBe(42);
  });
});

describe('buildStackedDeck', () => {
  const c = (rank: number, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

  it('deals exactly the requested hole cards and board', () => {
    const dealOrder = [1, 2]; // two seats
    const holeCards = {
      1: [c(14, 's'), c(13, 's')], // As Ks
      2: [c(2, 'h'), c(7, 'd')], // 2h 7d
    };
    const board = [c(14, 'h'), c(14, 'd'), c(5, 'c'), c(9, 'c'), c(3, 's')];
    const deck = buildStackedDeck({ holeCards, dealOrder, board });

    expect(deck).toHaveLength(52);

    // Simulate the engine deal: 2 passes, one card per seat per pass.
    expect(deck[0]).toEqual(holeCards[1][0]); // seat1 card 1
    expect(deck[1]).toEqual(holeCards[2][0]); // seat2 card 1
    expect(deck[2]).toEqual(holeCards[1][1]); // seat1 card 2
    expect(deck[3]).toEqual(holeCards[2][1]); // seat2 card 2

    // Board follows immediately after hole cards.
    expect(deck.slice(4, 9)).toEqual(board);

    // Still a full unique deck.
    expect(new Set(deck.map(cardKey)).size).toBe(52);
  });

  it('throws on a duplicate card in the spec', () => {
    expect(() =>
      buildStackedDeck({
        dealOrder: [1, 2],
        holeCards: { 1: [c(14, 's'), c(13, 's')], 2: [c(14, 's'), c(2, 'h')] },
        board: [],
      }),
    ).toThrow();
  });

  it('throws when a seat lacks two hole cards', () => {
    expect(() =>
      buildStackedDeck({
        dealOrder: [1],
        holeCards: { 1: [c(14, 's')] },
        board: [],
      }),
    ).toThrow();
  });
});
