import { describe, expect, it } from 'vitest';
import { openingActionOrder, POSITION_SPOTS } from '../positions';
import { createTable, startHand, applyAction } from '../../engine/reducer';
import { getLegalActions } from '../../engine/betting';
import { Street } from '../../engine/types';

function engineOrder(players: 2 | 6, folded: number[] = []) {
  let game = startHand(createTable({
    seats: Array.from({ length: players }, (_, id) => ({ id, name: `Seat ${id}`, isHuman: id === 0, stack: 1000 })),
    buttonSeatId: 0, smallBlind: 10, bigBlind: 20, seed: 1,
  }));
  const preflop: number[] = [];
  const flop: number[] = [];
  for (let i = 0; i < 20 && game.street !== Street.Turn; i++) {
    const seatId = game.toActSeatId!;
    const beforeFlop = game.street === Street.Preflop;
    (beforeFlop ? preflop : flop).push(seatId);
    const legal = getLegalActions(game);
    const type = beforeFlop && folded.includes(seatId) ? 'fold' : legal.some((a) => a.type === 'check') ? 'check' : 'call';
    game = applyAction(game, { type, seatId });
  }
  return { preflop, flop };
}

describe('position lesson uses real poker order', () => {
  it.each([2, 6] as const)('matches the engine before and after the flop with %i players', (players) => {
    const actual = engineOrder(players);
    expect(openingActionOrder(players, 'preflop')).toEqual(actual.preflop);
    expect(openingActionOrder(players, 'flop')).toEqual(actual.flop);
  });
  it('skips folded seats without moving the dealer or blinds', () => {
    expect(openingActionOrder(6, 'flop', [0, 3])).toEqual(engineOrder(6, [0, 3]).flop);
    expect(openingActionOrder(6, 'flop', [0, 3])).toEqual([1, 2, 4, 5]);
  });
  it('teaches the heads-up reversal', () => {
    expect(openingActionOrder(2, 'preflop')).toEqual([0, 1]);
    expect(openingActionOrder(2, 'flop')).toEqual([1, 0]);
  });
  it('all four spots have a selectable last actor', () => {
    expect(POSITION_SPOTS.map((spot) => {
      const order = openingActionOrder(spot.players, spot.street, spot.folded);
      const last = order[order.length - 1];
      expect(spot.folded).not.toContain(last);
      return last;
    })).toEqual([2, 0, 5, 0]);
  });
});
