import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../../../engine/reducer';
import { buildStackedDeck } from '../../../engine/deck';
import { evaluateHand } from '../../../engine/evaluator';
import type { Action, Card } from '../../../engine/types';
import { describeHand, featuredWinner, handSummary, isSplitPot, winnersOf } from '../result';

const c = (r: number, su: string): Card => ({ rank: r as Card['rank'], suit: su as Card['suit'] });
const act = (type: Action['type'], seatId: number, amount?: number): Action => ({ type, seatId, amount });
const NAMES = ['You', 'Ava', 'Ben', 'Cleo'];
function table(stacks: number[], button = 0): TableConfig {
  return {
    seats: stacks.map((stack, i) => ({ id: i, name: NAMES[i], isHuman: i === 0, stack })),
    buttonSeatId: button,
    smallBlind: 10,
    bigBlind: 20,
    seed: 7,
  };
}

/** Heads-up all-in: hero = seat 0 (button/SB), Ava = seat 1. */
function headsUp(hero: Card[], ava: Card[], board: Card[], stacks = [1000, 1000]) {
  const deck = buildStackedDeck({ dealOrder: [1, 0], holeCards: { 0: hero, 1: ava }, board });
  let s = startHand(createTable(table(stacks, 0)), { deck });
  s = applyAction(s, act('allin', 0));
  return applyAction(s, act('allin', 1));
}

describe('describeHand', () => {
  const d = (hole: Card[], board: Card[]) => describeHand(evaluateHand(hole, board));
  it('names hands in plain English', () => {
    expect(d([c(13, 's'), c(13, 'd')], [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')])).toBe('Pair of Kings');
    expect(d([c(14, 's'), c(7, 'd')], [c(14, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')])).toBe('Two Pair, Aces and Sevens');
    expect(d([c(6, 's'), c(6, 'd')], [c(6, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')])).toBe('Three Sixes');
    expect(d([c(14, 'h'), c(13, 'h')], [c(12, 'h'), c(11, 'h'), c(10, 'h'), c(4, 's'), c(3, 'c')])).toBe('Royal Flush');
    expect(d([c(5, 's'), c(5, 'd')], [c(5, 'c'), c(9, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')])).toBe('Full House, Fives full of Nines');
  });
});

describe('winners', () => {
  it('reads winners from the structured result, not log text', () => {
    const s = headsUp([c(14, 's'), c(14, 'h')], [c(13, 's'), c(13, 'd')], [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')]);
    expect(winnersOf(s.result)).toEqual([{ seatId: 0, amount: 2000 }]);
    expect(isSplitPot(s.result)).toBe(false);
    expect(featuredWinner(s)).toEqual({ seatId: 0, amount: 2000 });
  });

  it('flags a split pot', () => {
    const s = headsUp([c(2, 's'), c(3, 'h')], [c(2, 'd'), c(3, 'c')], [c(10, 'h'), c(11, 'c'), c(12, 's'), c(13, 'h'), c(14, 'd')]);
    expect(isSplitPot(s.result)).toBe(true);
    expect(winnersOf(s.result)).toHaveLength(2);
  });
});

describe('handSummary', () => {
  it('is null while the hand is live', () => {
    expect(handSummary(startHand(createTable(table([1000, 1000, 1000]))))).toBeNull();
  });

  it('explains a hero win and which cards played', () => {
    const s = headsUp([c(14, 's'), c(14, 'h')], [c(13, 's'), c(13, 'd')], [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')]);
    expect(handSummary(s)).toBe('Your Pair of Aces beat Ava’s Pair of Kings. Both of your cards played.');
  });

  it('explains a hero loss with the same kind of hand', () => {
    const s = headsUp([c(13, 's'), c(13, 'd')], [c(14, 's'), c(14, 'h')], [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')]);
    expect(handSummary(s)).toBe(
      'Ava’s Pair of Aces beat your Pair of Kings. Same kind of hand: the higher cards decided it. Both of Ava’s cards played.',
    );
  });

  it('says when only one hole card played', () => {
    const s = headsUp([c(14, 's'), c(2, 'h')], [c(13, 's'), c(3, 'd')], [c(14, 'c'), c(7, 'h'), c(9, 'd'), c(5, 's'), c(10, 'c')]);
    expect(handSummary(s)).toBe('Your Pair of Aces beat Ava’s Ace high. Only one of your cards played: A♠.');
  });

  it('explains a split where the board plays', () => {
    const s = headsUp([c(2, 's'), c(3, 'h')], [c(2, 'd'), c(3, 'c')], [c(10, 'h'), c(11, 'c'), c(12, 's'), c(13, 'h'), c(14, 'd')]);
    expect(handSummary(s)).toBe(
      'Split pot: You and Ava each had Straight to the Ace. The board was the best hand, so nobody’s own cards mattered.',
    );
  });

  it('explains an uncontested pot', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('fold', 0));
    s = applyAction(s, act('fold', 1));
    expect(handSummary(s)).toBe('You folded, and Ben took the pot without a showdown.');
  });

  it('names a different side-pot winner', () => {
    const deck = buildStackedDeck({
      dealOrder: [1, 2, 0],
      holeCards: {
        0: [c(14, 's'), c(14, 'd')],
        1: [c(13, 'h'), c(12, 'h')],
        2: [c(7, 'c'), c(2, 'd')],
      },
      board: [c(14, 'h'), c(14, 'c'), c(13, 's'), c(9, 'h'), c(4, 'h')],
    });
    let s = startHand(createTable(table([100, 200, 200], 0)), { deck });
    s = applyAction(s, act('allin', 0));
    s = applyAction(s, act('allin', 1));
    s = applyAction(s, act('allin', 2));
    expect(handSummary(s)).toMatch(/^Your Four Aces beat Ava’s Ace-high Flush\. .* Ava won the side pot\.$/);
  });
});
