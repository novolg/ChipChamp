import { describe, it, expect } from 'vitest';
import { computeSidePots, resolveShowdown } from '../pots';
import type { GameState, Seat } from '../types';
import { Street } from '../types';

function seat(partial: Partial<Seat> & { id: number }): Seat {
  return {
    id: partial.id,
    name: partial.name ?? `S${partial.id}`,
    isHuman: false,
    stack: partial.stack ?? 0,
    holeCards: partial.holeCards ?? [],
    committedThisStreet: 0,
    committedTotal: partial.committedTotal ?? 0,
    status: partial.status ?? 'active',
    hasActedThisStreet: false,
  };
}

describe('computeSidePots', () => {
  it('makes one main pot when all contribute equally', () => {
    const pots = computeSidePots([
      seat({ id: 0, committedTotal: 100 }),
      seat({ id: 1, committedTotal: 100 }),
      seat({ id: 2, committedTotal: 100 }),
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligibleSeatIds.sort()).toEqual([0, 1, 2]);
  });

  it('creates side pots for unequal all-ins', () => {
    // S0 all-in 50, S1 all-in 100, S2 calls 100.
    const pots = computeSidePots([
      seat({ id: 0, committedTotal: 50, status: 'allin' }),
      seat({ id: 1, committedTotal: 100, status: 'allin' }),
      seat({ id: 2, committedTotal: 100, status: 'active' }),
    ]);
    // Main pot: 50*3 = 150 (all eligible). Side pot: 50*2 = 100 (S1, S2).
    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligibleSeatIds.sort()).toEqual([0, 1, 2]);
    expect(pots[1].amount).toBe(100);
    expect(pots[1].eligibleSeatIds.sort()).toEqual([1, 2]);
  });

  it('counts folded contributions but excludes them from eligibility', () => {
    // S0 folded after putting in 30; S1 and S2 each 100.
    const pots = computeSidePots([
      seat({ id: 0, committedTotal: 30, status: 'folded' }),
      seat({ id: 1, committedTotal: 100 }),
      seat({ id: 2, committedTotal: 100 }),
    ]);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(230); // folded chips still in the pot
    // S0 never eligible.
    for (const pot of pots) expect(pot.eligibleSeatIds).not.toContain(0);
  });
});

describe('resolveShowdown', () => {
  const c = (rank: number, suit: string) => ({ rank: rank as Seat['holeCards'][number]['rank'], suit: suit as 'c' | 'd' | 'h' | 's' });

  function state(seats: Seat[], board: ReturnType<typeof c>[]): GameState {
    return {
      seats,
      buttonSeatId: 0,
      smallBlind: 1,
      bigBlind: 2,
      street: Street.Showdown,
      board,
      deck: [],
      pots: [],
      toActSeatId: null,
      currentBet: 0,
      minRaise: 2,
      lastAggressorSeatId: null,
      lastFullRaiseSize: 2,
      rngState: 1,
      handNumber: 1,
      log: [],
      phase: 'showdown',
    };
  }

  it('awards the pot to the best hand', () => {
    const seats = [
      seat({ id: 0, committedTotal: 100, holeCards: [c(14, 's'), c(14, 'd')] }), // pair aces
      seat({ id: 1, committedTotal: 100, holeCards: [c(13, 's'), c(13, 'd')] }), // pair kings
    ];
    const board = [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(11, 'c')];
    const awards = resolveShowdown(state(seats, board));
    const s0 = awards.filter((a) => a.seatId === 0).reduce((s, a) => s + a.amount, 0);
    expect(s0).toBe(200);
  });

  it('returns an unmatched extra contribution to its contributor', () => {
    // Both play the same board straight, but seat 1 put in 1 chip more than anyone
    // matched. Main pot (100) splits 50/50; the extra chip returns to seat 1.
    const seats = [
      seat({ id: 0, committedTotal: 50, holeCards: [c(2, 's'), c(3, 'd')] }),
      seat({ id: 1, committedTotal: 51, holeCards: [c(2, 'h'), c(3, 'c')] }),
    ];
    const board = [c(10, 'c'), c(11, 'h'), c(12, 'd'), c(13, 's'), c(14, 'c')]; // T-J-Q-K-A straight
    const awards = resolveShowdown(state(seats, board));
    expect(awards.reduce((s, a) => s + a.amount, 0)).toBe(101);
    const s0 = awards.filter((a) => a.seatId === 0).reduce((s, a) => s + a.amount, 0);
    const s1 = awards.filter((a) => a.seatId === 1).reduce((s, a) => s + a.amount, 0);
    expect(s0).toBe(50);
    expect(s1).toBe(51);
  });

  it('splits an odd pot, giving the odd chip to the seat closest left of the button', () => {
    // Three seats each in for 35 (seat 0 folded); seats 1 and 2 tie on the board.
    // Pot 105 / 2 = 52 + 53; odd chip to seat 1 (closest clockwise from button 0).
    const seats = [
      seat({ id: 0, committedTotal: 35, status: 'folded' }),
      seat({ id: 1, committedTotal: 35, holeCards: [c(2, 's'), c(3, 'd')] }),
      seat({ id: 2, committedTotal: 35, holeCards: [c(2, 'h'), c(3, 'c')] }),
    ];
    const board = [c(10, 'c'), c(11, 'h'), c(12, 'd'), c(13, 's'), c(14, 'c')]; // shared straight
    const awards = resolveShowdown(state(seats, board));
    expect(awards.reduce((s, a) => s + a.amount, 0)).toBe(105);
    const s1 = awards.filter((a) => a.seatId === 1).reduce((s, a) => s + a.amount, 0);
    const s2 = awards.filter((a) => a.seatId === 2).reduce((s, a) => s + a.amount, 0);
    expect(s1).toBe(53);
    expect(s2).toBe(52);
  });
});
