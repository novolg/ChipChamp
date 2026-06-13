import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../../../engine/reducer';
import { buildStackedDeck } from '../../../engine/deck';
import type { Action, Card, GameState, Seat } from '../../../engine/types';
import { deriveEmotion } from '../botEmotion';
import { winnerNames } from '../derive';

const NAMES = ['You', 'Ava', 'Ben', 'Cleo'];

function table(stacks: number[], button = 0): TableConfig {
  return {
    seats: stacks.map((stack, i) => ({
      id: i,
      name: NAMES[i],
      isHuman: i === 0,
      stack,
    })),
    buttonSeatId: button,
    smallBlind: 10,
    bigBlind: 20,
    seed: 12345,
  };
}

const act = (type: Action['type'], seatId: number, amount?: number): Action => ({
  type,
  seatId,
  amount,
});

const c = (r: number, su: string): Card => ({ rank: r as Card['rank'], suit: su as Card['suit'] });

const seatOf = (g: GameState, id: number): Seat => g.seats.find((s) => s.id === id)!;

const NO_WINNERS = new Set<string>();

const emotionOf = (
  g: GameState,
  id: number,
  thinking = false,
  winners: Set<string> = NO_WINNERS,
  last?: Action['type'],
) => deriveEmotion(seatOf(g, id), g, thinking, winners, last);

/** Heads-up AA vs KK, both all-in: You wins the showdown, Ava loses revealed. */
function showdownHand(): GameState {
  const deck = buildStackedDeck({
    dealOrder: [1, 0], // heads-up: button (seat 0) is dealt last
    holeCards: {
      0: [c(14, 's'), c(14, 'h')], // AA
      1: [c(13, 's'), c(13, 'd')], // KK
    },
    board: [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')],
  });
  let s = startHand(createTable(table([1000, 1000], 0)), { deck });
  s = applyAction(s, act('allin', 0));
  s = applyAction(s, act('allin', 1));
  return s;
}

describe('deriveEmotion priority cascade', () => {
  it('folded seats sleep', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('fold', 0));
    expect(emotionOf(s, 0)).toBe('asleep');
  });

  it('winner is happy at hand completion; folded seats stay asleep', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('raise', 0, 60));
    s = applyAction(s, act('fold', 1));
    s = applyAction(s, act('fold', 2));
    expect(s.phase).toBe('handComplete');
    const winners = winnerNames(s);
    expect(emotionOf(s, 0, false, winners)).toBe('happy');
    expect(emotionOf(s, 1, false, winners)).toBe('asleep'); // rule 1 beats rule 2
  });

  it('revealed showdown loser is sad, winner happy', () => {
    const s = showdownHand();
    const winners = winnerNames(s);
    expect(emotionOf(s, 0, false, winners)).toBe('happy');
    expect(emotionOf(s, 1, false, winners)).toBe('sad');
  });

  it('a shove holds the shover wide-eyed and shocks active opponents', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('allin', 0));
    expect(emotionOf(s, 0)).toBe('shocked'); // at risk (status allin)
    expect(emotionOf(s, 1)).toBe('shocked'); // reaction to someone else's shove
    // The transient shock clears as soon as a new log entry lands; the huge
    // bet to call now reads as pressure instead.
    s = applyAction(s, act('fold', 1));
    expect(emotionOf(s, 2)).toBe('worried');
  });

  it('thinking shows while a bot decides, but shock outranks it', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    expect(emotionOf(s, 0, true)).toBe('thinking');
    expect(emotionOf(s, 0, true, NO_WINNERS, 'raise')).toBe('thinking'); // rule 5 beats rule 6
    s = applyAction(s, act('allin', 0));
    expect(emotionOf(s, 1, true)).toBe('shocked'); // rule 4 beats rule 5
  });

  it('a recent bet or raise reads confident', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('raise', 0, 60));
    expect(emotionOf(s, 0, false, NO_WINNERS, 'raise')).toBe('confident');
  });

  it('facing four big blinds or more to call reads worried', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('raise', 0, 100));
    // SB committed 10, owes 90 >= 4 * 20.
    expect(emotionOf(s, 1)).toBe('worried');
  });

  it('owing 30% of the stack reads worried even below four big blinds', () => {
    let s = startHand(createTable(table([1000, 150, 1000])));
    s = applyAction(s, act('raise', 0, 60));
    // SB committed 10, stack 140: owes 50 < 80 but 50 >= 0.3 * 140.
    expect(emotionOf(s, 1)).toBe('worried');
  });

  it('defaults to idle: no pressure, nothing to react to', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    expect(emotionOf(s, 2)).toBe('idle'); // BB, nothing owed preflop
    s = applyAction(s, act('raise', 0, 40));
    expect(emotionOf(s, 1)).toBe('idle'); // owes 30: under both thresholds
  });
});

describe('winnerNames', () => {
  it('is empty while the hand is still being played', () => {
    const s = startHand(createTable(table([1000, 1000, 1000])));
    expect(winnerNames(s).size).toBe(0);
  });

  it('parses the uncontested win note', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('raise', 0, 60));
    s = applyAction(s, act('fold', 1));
    s = applyAction(s, act('fold', 2));
    expect(winnerNames(s)).toEqual(new Set(['You']));
  });

  it('parses showdown notes, one per winner in a split pot', () => {
    // Identical aces with identical board kickers: a true chop.
    const deck = buildStackedDeck({
      dealOrder: [1, 0],
      holeCards: {
        0: [c(14, 's'), c(14, 'h')],
        1: [c(14, 'd'), c(14, 'c')],
      },
      board: [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'h')],
    });
    let s = startHand(createTable(table([1000, 1000], 0)), { deck });
    s = applyAction(s, act('allin', 0));
    s = applyAction(s, act('allin', 1));
    expect(s.phase).toBe('handComplete');
    expect(winnerNames(s)).toEqual(new Set(['You', 'Ava']));
  });
});
