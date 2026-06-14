import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../reducer';
import { getLegalActions } from '../betting';
import { buildStackedDeck } from '../deck';
import { Street, type Action, type Card } from '../types';

function table(stacks: number[], button = 0): TableConfig {
  return {
    seats: stacks.map((stack, i) => ({
      id: i,
      name: `S${i}`,
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

describe('startHand', () => {
  it('deals two hole cards each and posts blinds', () => {
    const s = startHand(createTable(table([1000, 1000, 1000])));
    for (const seat of s.seats) expect(seat.holeCards).toHaveLength(2);
    // 3-handed: SB = seat1, BB = seat2.
    expect(s.seats[1].committedThisStreet).toBe(10);
    expect(s.seats[2].committedThisStreet).toBe(20);
    expect(s.currentBet).toBe(20);
    // Button (seat 0) acts first preflop (left of BB).
    expect(s.toActSeatId).toBe(0);
    expect(s.pots[0].amount).toBe(30);
  });

  it('offers the big blind its option when limped to', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('call', 0)); // button calls 20
    s = applyAction(s, act('call', 1)); // SB completes
    // Action returns to BB (seat 2) even though the bet is matched.
    expect(s.toActSeatId).toBe(2);
    const legal = getLegalActions(s).map((a) => a.type);
    expect(legal).toContain('check');
    expect(legal).toContain('raise');
  });
});

describe('betting round progression', () => {
  it('advances to the flop after preflop betting closes', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('call', 0));
    s = applyAction(s, act('call', 1));
    s = applyAction(s, act('check', 2)); // BB checks option
    expect(s.street).toBe(Street.Flop);
    expect(s.board).toHaveLength(3);
    expect(s.currentBet).toBe(0);
    // Postflop, first to act is left of button (seat 1).
    expect(s.toActSeatId).toBe(1);
  });

  it('tracks min-raise after a raise', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('raise', 0, 60)); // raise to 60 (increment 40)
    expect(s.currentBet).toBe(60);
    expect(s.minRaise).toBe(40);
    // Next raise must be to at least 100.
    const raise = getLegalActions(s).find((a) => a.type === 'raise');
    expect(raise?.min).toBe(100);
  });

  it('bases the min-raise on the last full raise level after a short all-in (not the inflated bet)', () => {
    // 4-handed, button 0 → SB=1, BB=2, UTG=3. Seat 1 is short and can only shove to 90.
    let s = startHand(createTable(table([1000, 90, 1000, 1000], 0)));
    s = applyAction(s, act('raise', 3, 60)); // UTG full raise to 60 (increment 40)
    s = applyAction(s, act('call', 0));       // button calls 60
    s = applyAction(s, act('allin', 1));      // SB all-in to 90 (short: increment 30 < 40)
    expect(s.currentBet).toBe(90);
    expect(s.minRaise).toBe(40);              // a short all-in must not change minRaise
    expect(s.toActSeatId).toBe(2);            // BB still has a live decision
    const raise = getLegalActions(s).find((a) => a.type === 'raise');
    expect(raise).toBeDefined();
    expect(raise?.min).toBe(100);             // 60 (last full raise) + 40, NOT 90 + 40
  });

  it('still offers a legal raise after a short all-in when the player can only afford the correct minimum', () => {
    // BB (seat 2) can just make the canonical min-raise to 100, but less than the buggy 130.
    let s = startHand(createTable(table([1000, 90, 100, 1000], 0)));
    s = applyAction(s, act('raise', 3, 60));
    s = applyAction(s, act('call', 0));
    s = applyAction(s, act('allin', 1)); // SB short all-in to 90
    expect(s.toActSeatId).toBe(2);       // BB: committed 20, stack 80 → maxTo 100
    const legal = getLegalActions(s).map((a) => a.type);
    expect(legal).toContain('raise');    // a raise-to-100 is legal and must be offered
  });
});

describe('illegal action validation', () => {
  it('rejects a raise below the legal minimum', () => {
    const s = startHand(createTable(table([1000, 1000, 1000])));
    // Preflop min raise-to is 40 (BB 20 + minRaise 20); raising to 25 is illegal.
    expect(() => applyAction(s, act('raise', s.toActSeatId!, 25))).toThrow();
  });

  it('accepts a raise exactly at the legal minimum', () => {
    const s = startHand(createTable(table([1000, 1000, 1000])));
    const r = applyAction(s, act('raise', s.toActSeatId!, 40));
    expect(r.currentBet).toBe(40);
  });

  it('rejects a bet below the legal minimum', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('call', 0));
    s = applyAction(s, act('call', 1));
    s = applyAction(s, act('check', 2)); // advance to the flop
    expect(s.street).toBe(Street.Flop);
    // Postflop min bet is one big blind (20); betting 5 is illegal.
    expect(() => applyAction(s, act('bet', s.toActSeatId!, 5))).toThrow();
  });
});

describe('hand ends by folds', () => {
  it('awards the pot uncontested when everyone folds to the raiser', () => {
    let s = startHand(createTable(table([1000, 1000, 1000])));
    s = applyAction(s, act('raise', 0, 60));
    s = applyAction(s, act('fold', 1));
    s = applyAction(s, act('fold', 2));
    expect(s.phase).toBe('handComplete');
    // Seat 0 invested 60 and wins SB(10)+BB(20)+own 60 = 90 → net stack 940 + 90 = ...
    // committedTotal: seat0 60, seat1 10, seat2 20 → pot 90 to seat0.
    expect(s.seats[0].stack).toBe(1000 - 60 + 90);
  });
});

describe('all-in run-out to showdown', () => {
  it('runs the board and awards the pot to the best hand (heads-up)', () => {
    // Heads-up: button (seat0) is SB. Deal order is [1, 0].
    const c = (r: number, su: string): Card => ({ rank: r as Card['rank'], suit: su as Card['suit'] });
    const deck = buildStackedDeck({
      dealOrder: [1, 0],
      holeCards: {
        0: [c(14, 's'), c(14, 'h')], // AA
        1: [c(13, 's'), c(13, 'd')], // KK
      },
      board: [c(2, 'c'), c(7, 'h'), c(9, 'd'), c(4, 's'), c(3, 'c')],
    });

    let s = startHand(createTable(table([1000, 1000], 0)), { deck });
    expect(s.toActSeatId).toBe(0); // SB/button acts first heads-up
    s = applyAction(s, act('allin', 0));
    s = applyAction(s, act('allin', 1));

    expect(s.phase).toBe('handComplete');
    expect(s.street).toBe(Street.Showdown);
    expect(s.board).toHaveLength(5);
    expect(s.seats[0].stack).toBe(2000); // AA wins the 2000 pot
    expect(s.seats[1].stack).toBe(0);
  });
});

describe('three-way all-in side pots (end to end)', () => {
  it('awards the main and side pots to the correct players', () => {
    const cc = (r: number, su: string): Card => ({ rank: r as Card['rank'], suit: su as Card['suit'] });
    // 3-handed, button 0. Deal order [1, 2, 0]. SB=seat1, BB=seat2.
    const deck = buildStackedDeck({
      dealOrder: [1, 2, 0],
      holeCards: {
        0: [cc(14, 's'), cc(14, 'd')], // will make quad aces (best)
        1: [cc(13, 'h'), cc(12, 'h')], // ace-high heart flush (2nd)
        2: [cc(7, 'c'), cc(2, 'd')], // plays the board, pair of aces (worst)
      },
      board: [cc(14, 'h'), cc(14, 'c'), cc(13, 's'), cc(9, 'h'), cc(4, 'h')],
    });

    // Short stack (100) all-in for less than the others (200 each).
    let s = startHand(createTable(table([100, 200, 200], 0)), { deck });
    s = applyAction(s, act('allin', 0)); // button shoves 100
    s = applyAction(s, act('allin', 1)); // SB shoves 200
    s = applyAction(s, act('allin', 2)); // BB calls all-in for 200

    expect(s.phase).toBe('handComplete');
    // Main pot 300 → seat 0 (quads, eligible). Side pot 200 → seat 1 (flush) beats seat 2.
    expect(s.seats[0].stack).toBe(300);
    expect(s.seats[1].stack).toBe(200);
    expect(s.seats[2].stack).toBe(0);
    // Chips conserved.
    expect(s.seats.reduce((sum, x) => sum + x.stack, 0)).toBe(500);
  });
});

describe('uncalled over-bet at showdown', () => {
  it('returns the uncalled overage and never narrates the losing over-bettor as a winner', () => {
    const cc = (r: number, su: string): Card => ({ rank: r as Card['rank'], suit: su as Card['suit'] });
    // Heads-up, button 0 (= SB). Deal order [1, 0].
    const deck = buildStackedDeck({
      dealOrder: [1, 0],
      holeCards: {
        0: [cc(7, 'd'), cc(2, 'h')],   // BigStack: only plays the board's pair of aces (loser)
        1: [cc(14, 'c'), cc(13, 'c')], // ShortStack: trip aces (winner)
      },
      board: [cc(14, 's'), cc(14, 'h'), cc(5, 'c'), cc(9, 'd'), cc(3, 's')],
    });
    let s = startHand(createTable(table([1000, 100], 0)), { deck });
    s = applyAction(s, act('allin', 0)); // BigStack shoves 1000
    s = applyAction(s, act('allin', 1)); // ShortStack calls all-in for only 100

    expect(s.phase).toBe('handComplete');
    expect(s.seats.reduce((sum, x) => sum + x.stack, 0)).toBe(1100); // chips conserved
    // ShortStack wins the contested 200; BigStack's uncalled 900 comes back.
    expect(s.seats[1].stack).toBe(200);
    expect(s.seats[0].stack).toBe(900);
    // The loser (seat 0, "S0") must never be logged as winning a pot.
    expect(s.log.some((e) => (e.note ?? '').startsWith('S0 wins'))).toBe(false);
    // The uncalled bet is returned with its own log line.
    expect(s.log.some((e) => /uncalled bet of 900 is returned/i.test(e.note ?? ''))).toBe(true);
  });
});

describe('bot/UI never sees illegal turn', () => {
  it('rejects out-of-turn actions', () => {
    const s = startHand(createTable(table([1000, 1000, 1000])));
    expect(() => applyAction(s, act('call', 2))).toThrow();
  });
});
