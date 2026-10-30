import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../../../engine/reducer';
import { buildStackedDeck } from '../../../engine/deck';
import type { Action, Card, GameState } from '../../../engine/types';
import { showdownSteps, HIGHLIGHT_MS, REVEAL_MS, RUNOUT_MS } from '../showdownStage';
import { winningCardKeys } from '../derive';

const c = (r: number, su: string): Card => ({ rank: r as Card['rank'], suit: su as Card['suit'] });
const act = (type: Action['type'], seatId: number, amount?: number): Action => ({ type, seatId, amount });
const table = (stacks: number[]): TableConfig => ({
  seats: stacks.map((stack, i) => ({ id: i, name: ['You', 'Ava', 'Ben'][i], isHuman: i === 0, stack })),
  buttonSeatId: 0,
  smallBlind: 10,
  bigBlind: 20,
  seed: 3,
});
const deck = buildStackedDeck({
  dealOrder: [1, 0],
  holeCards: { 0: [c(14, 's'), c(14, 'h')], 1: [c(13, 's'), c(13, 'd')] },
  board: [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')],
});

describe('showdownSteps', () => {
  it('stages a preflop all-in: reveal, flop, turn, river, highlight', () => {
    let prev = startHand(createTable(table([1000, 1000])), { deck });
    prev = applyAction(prev, act('allin', 0));
    const final = applyAction(prev, act('allin', 1));
    const steps = showdownSteps(prev, final);

    expect(steps.map((s) => s.game.board.length)).toEqual([0, 3, 4, 5, 5]);
    expect(steps.map((s) => s.holdMs)).toEqual([REVEAL_MS, RUNOUT_MS, RUNOUT_MS, RUNOUT_MS, HIGHLIGHT_MS]);
    // Stacks hold the pre-award values until the payout: both all-in → 0.
    for (const s of steps) expect(s.game.seats.map((x) => x.stack)).toEqual([0, 0]);
    // No winner highlight until the last step.
    expect(steps.slice(0, -1).every((s) => winningCardKeys(s.game).size === 0)).toBe(true);
    expect(winningCardKeys(steps[4].game).size).toBe(5);
    expect(steps.every((s) => s.game.phase === 'showdown')).toBe(true);
  });

  it('stages a river showdown as reveal then highlight', () => {
    let s: GameState = startHand(createTable(table([1000, 1000])), { deck });
    s = applyAction(s, act('call', 0));
    s = applyAction(s, act('check', 1));
    for (let street = 0; street < 2; street++) {
      s = applyAction(s, act('check', 1));
      s = applyAction(s, act('check', 0));
    }
    s = applyAction(s, act('check', 1));
    const final = applyAction(s, act('check', 0));
    expect(final.phase).toBe('handComplete');
    expect(showdownSteps(s, final).map((x) => x.game.board.length)).toEqual([5, 5]);
  });

  it('does not stage a folded-out pot', () => {
    const prev = startHand(createTable(table([1000, 1000, 1000])));
    const final = applyAction(applyAction(prev, act('fold', 0)), act('fold', 1));
    expect(showdownSteps(applyAction(prev, act('fold', 0)), final)).toEqual([]);
  });

  it('does not restage an already complete hand', () => {
    let prev = startHand(createTable(table([1000, 1000])), { deck });
    prev = applyAction(prev, act('allin', 0));
    const final = applyAction(prev, act('allin', 1));
    expect(showdownSteps(final, final)).toEqual([]);
  });
});
