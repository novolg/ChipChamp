import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../../../engine/reducer';
import { buildStackedDeck } from '../../../engine/deck';
import type { Action, Card, GameState, Seat } from '../../../engine/types';
import { deriveEmotion, chipLeaderProud, handTell } from '../botEmotion';
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

  it('idle with no pressure; suspicious under a moderate raise', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    expect(emotionOf(s, 2)).toBe('idle'); // BB, nothing owed preflop
    s = applyAction(s, act('raise', 0, 40));
    expect(emotionOf(s, 1)).toBe('suspicious'); // owes 30: below worried thresholds → suspicious
  });

  it('moderate aggression → suspicious (below the worried threshold)', () => {
    // Blinds 10/20, stacks 1000. UTG (seat 3) raises to 60; the next seat to act
    // owes 60, which is < 4*BB (80) and < 0.3*stack (300) → suspicious, not worried.
    let s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    s = applyAction(s, act('raise', s.toActSeatId!, 60));
    const ower = seatOf(s, s.toActSeatId!);
    expect(emotionOf(s, ower.id)).toBe('suspicious');
  });

  it('big aggression still → worried (worried beats suspicious)', () => {
    // UTG (seat 3) raises to 140; the next seat to act owes 140 ≥ 4*BB (80) → worried.
    let s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    s = applyAction(s, act('raise', s.toActSeatId!, 140));
    const ower = seatOf(s, s.toActSeatId!);
    expect(emotionOf(s, ower.id)).toBe('worried');
  });

  it('nothing owed → not suspicious (stays idle)', () => {
    // Fresh hand, the big blind owes 0 preflop.
    const s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    const bb = s.seats.find((x) => x.committedThisStreet === s.bigBlind)!;
    // BB faces no raise yet; owe == 0.
    expect(emotionOf(s, bb.id)).not.toBe('suspicious');
  });
});

describe('chipLeaderProud', () => {
  it('true only for a dominant chip leader (≥1.5× next stack)', () => {
    // Ava (seat 1) has 3000; next-largest live stack is 1000 → 3× lead.
    const s = startHand(createTable(table([1000, 3000, 1000, 1000], 0)));
    expect(chipLeaderProud(seatOf(s, 1), s)).toBe(true);
    expect(chipLeaderProud(seatOf(s, 2), s)).toBe(false);
  });

  it('false on a close lead (< 1.5×)', () => {
    // 1400 vs 1000 = 1.4× → not proud.
    const s = startHand(createTable(table([1000, 1400, 1000, 1000], 0)));
    expect(chipLeaderProud(seatOf(s, 1), s)).toBe(false);
  });

  it('false for a folded seat', () => {
    let s = startHand(createTable(table([1000, 3000, 1000, 1000], 0)));
    s = applyAction(s, act('fold', s.toActSeatId!)); // fold the actor
    const folded = s.seats.find((x) => x.status === 'folded')!;
    expect(chipLeaderProud(folded, s)).toBe(false);
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

describe('handTell', () => {
  it('preflop: premium → strong, trash → weak, in-between → null', () => {
    const deck = buildStackedDeck({
      dealOrder: [1, 2, 3, 0],
      holeCards: {
        0: [c(6, 'c'), c(3, 'h')], // junk — seat 0 must have 2 cards
        1: [c(14, 's'), c(14, 'h')], // AA  → chenScore 20 (strong)
        2: [c(7, 's'), c(2, 'd')], //  72o → chenScore ~0 (weak)
        3: [c(10, 's'), c(9, 's')], // T9s → chenScore 8 (strong tier, not premium → null)
      },
      board: [c(5, 'c'), c(8, 'h'), c(4, 'c'), c(6, 'd'), c(3, 'd')],
    });
    const s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)), { deck });
    expect(handTell(seatOf(s, 1), s.board)).toBe('strong');
    expect(handTell(seatOf(s, 2), s.board)).toBe('weak');
    expect(handTell(seatOf(s, 3), s.board)).toBe(null);
  });

  it('postflop: made two-pair+ → strong, air → weak, medium pair → null', () => {
    const deck = buildStackedDeck({
      dealOrder: [1, 2, 3, 0],
      holeCards: {
        0: [c(6, 'c'), c(3, 'h')], // junk — seat 0 must have 2 cards
        1: [c(14, 's'), c(14, 'h')], // pairs the board for trips/strong
        2: [c(7, 'd'), c(2, 'c')], //  total air on this board
        3: [c(5, 's'), c(5, 'h')], // pocket 5s → one pair below board → 'medium' → null
      },
      board: [c(14, 'c'), c(9, 'h'), c(4, 'd')], // flop only (length 3)
    });
    let s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)), { deck });
    // advance to the flop so board has 3 cards: everyone checks/calls to flop.
    while (s.board.length < 3) {
      const id = s.toActSeatId;
      if (id == null) break;
      const owe = s.currentBet - seatOf(s, id).committedThisStreet;
      s = applyAction(s, owe > 0 ? act('call', id) : act('check', id));
    }
    expect(handTell(seatOf(s, 1), s.board)).toBe('strong'); // trip aces
    expect(handTell(seatOf(s, 2), s.board)).toBe('weak'); // high-card air
    expect(handTell(seatOf(s, 3), s.board)).toBe(null); // one pair (medium bucket) → null
  });

  it('null when the seat has no cards', () => {
    const s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    const fake = { ...seatOf(s, 0), holeCards: [] };
    expect(handTell(fake, s.board)).toBe(null);
  });
});
