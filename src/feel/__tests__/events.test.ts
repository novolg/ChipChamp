import { describe, expect, it } from 'vitest';
import { deriveFeelEvents } from '../events';
import { Street } from '../../engine/types';
import type { Card, GameState, Seat } from '../../engine/types';

function card(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

function seat(id: number, name: string, isHuman: boolean, overrides: Partial<Seat> = {}): Seat {
  return {
    id,
    name,
    isHuman,
    stack: 1000,
    holeCards: [],
    committedThisStreet: 0,
    committedTotal: 0,
    status: 'active',
    hasActedThisStreet: false,
    ...overrides,
  };
}

/** Minimal GameState fixture: You (hero) + Ava/Ben/Cleo (bots, seat order = left/center/right). */
function gs(partial: Partial<GameState> = {}): GameState {
  return {
    seats: [seat(0, 'You', true), seat(1, 'Ava', false), seat(2, 'Ben', false), seat(3, 'Cleo', false)],
    buttonSeatId: 0,
    smallBlind: 10,
    bigBlind: 20,
    street: Street.Preflop,
    board: [],
    deck: [],
    pots: [],
    toActSeatId: null,
    currentBet: 0,
    minRaise: 20,
    lastAggressorSeatId: null,
    lastFullRaiseLevel: 0,
    rngState: 0,
    handNumber: 1,
    log: [],
    phase: 'betting',
    ...partial,
  };
}

describe('deriveFeelEvents', () => {
  it('null prev -> empty (first observation syncs silently)', () => {
    expect(deriveFeelEvents(null, gs())).toEqual([]);
  });

  it('new hand -> HAND_START', () => {
    const prev = gs({ handNumber: 1 });
    const next = gs({ handNumber: 2 });
    expect(deriveFeelEvents(prev, next)).toEqual([{ type: 'HAND_START', handNumber: 2 }]);
  });

  it('bot raise log entry -> ACTION with slot + amountBB', () => {
    const prev = gs({ log: [] });
    const next = gs({
      log: [{ street: Street.Preflop, action: { type: 'raise', seatId: 1, amount: 60 } }],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'ACTION', action: 'raise', seatId: 1, slot: 'left', amountBB: 3 },
    ]);
  });

  it('postBlind log entries are not surfaced as ACTION', () => {
    const prev = gs({ log: [] });
    const next = gs({
      log: [{ street: Street.Preflop, action: { type: 'postBlind', seatId: 1, amount: 20 } }],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([]);
  });

  it('flop -> STREET_REVEAL with count 3', () => {
    const prev = gs({ street: Street.Preflop, board: [], toActSeatId: 1 });
    const next = gs({
      street: Street.Flop,
      board: [card(2, 'c'), card(9, 'd'), card(14, 's')],
      toActSeatId: 1,
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'STREET_REVEAL', street: Street.Flop, count: 3 },
    ]);
  });

  it('turn/river -> STREET_REVEAL with count 1', () => {
    const prev = gs({
      street: Street.Flop,
      board: [card(2, 'c'), card(9, 'd'), card(14, 's')],
      toActSeatId: 1,
    });
    const next = gs({
      street: Street.Turn,
      board: [card(2, 'c'), card(9, 'd'), card(14, 's'), card(4, 'h')],
      toActSeatId: 1,
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'STREET_REVEAL', street: Street.Turn, count: 1 },
    ]);
  });

  it('street flip with prev commits -> SWEEP with the committed slots/amounts', () => {
    const prev = gs({
      street: Street.Turn,
      board: [card(2, 'c'), card(9, 'd'), card(14, 's'), card(4, 'h')],
      seats: [
        seat(0, 'You', true, { committedThisStreet: 20 }),
        seat(1, 'Ava', false, { committedThisStreet: 0 }),
        seat(2, 'Ben', false, { committedThisStreet: 40 }),
        seat(3, 'Cleo', false, { committedThisStreet: 0 }),
      ],
    });
    const next = gs({
      street: Street.River,
      board: prev.board, // isolate SWEEP from STREET_REVEAL
      seats: [
        seat(0, 'You', true, { committedThisStreet: 0 }),
        seat(1, 'Ava', false, { committedThisStreet: 0 }),
        seat(2, 'Ben', false, { committedThisStreet: 0 }),
        seat(3, 'Cleo', false, { committedThisStreet: 0 }),
      ],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      {
        type: 'SWEEP',
        from: [
          { slot: 'hero', amount: 20 },
          { slot: 'center', amount: 40 },
        ],
      },
    ]);
  });

  it('no SWEEP when street is unchanged even if seats have commitments', () => {
    const prev = gs({
      street: Street.Preflop,
      seats: [
        seat(0, 'You', true, { committedThisStreet: 20 }),
        seat(1, 'Ava', false),
        seat(2, 'Ben', false),
        seat(3, 'Cleo', false),
      ],
    });
    const next = gs({
      street: Street.Preflop,
      seats: [
        seat(0, 'You', true, { committedThisStreet: 20 }),
        seat(1, 'Ava', false),
        seat(2, 'Ben', false),
        seat(3, 'Cleo', false),
      ],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([]);
  });

  it('hero toAct transition -> TURN_START', () => {
    const prev = gs({ phase: 'betting', toActSeatId: 1 });
    const next = gs({ phase: 'betting', toActSeatId: 0 });
    expect(deriveFeelEvents(prev, next)).toEqual([{ type: 'TURN_START' }]);
  });

  it('no TURN_START on a new hand even when hero is first to act (HAND_START only)', () => {
    // useTableSfx returns early on a hand-number change BEFORE its toAct check,
    // deliberately suppressing the your-turn cue at hand start.
    const prev = gs({ handNumber: 1, phase: 'handComplete', toActSeatId: null });
    const next = gs({ handNumber: 2, phase: 'betting', toActSeatId: 0 });
    expect(deriveFeelEvents(prev, next)).toEqual([{ type: 'HAND_START', handNumber: 2 }]);
  });

  it('TURN_START does NOT re-fire on an unchanged snapshot (StrictMode double-invoke)', () => {
    const snap = gs({ phase: 'betting', toActSeatId: 0 });
    // First diff establishes hero-to-act.
    expect(deriveFeelEvents(gs({ phase: 'betting', toActSeatId: 1 }), snap)).toEqual([
      { type: 'TURN_START' },
    ]);
    // Re-running the effect with the identical snapshot (StrictMode double-invoke,
    // or a re-render that changed nothing) must NOT refire TURN_START.
    expect(deriveFeelEvents(snap, snap)).toEqual([]);
  });

  it('handComplete with a hero payout -> WIN{heroWon:true}', () => {
    const prev = gs({ phase: 'betting', log: [] });
    const next = gs({
      phase: 'handComplete',
      result: { uncontested: false, payouts: [{ seatId: 0, amount: 218, potIndex: 0 }], shown: [] },
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'WIN', heroWon: true, amount: 218, winnerSlot: 'hero' },
    ]);
  });

  it('sums the hero\'s payouts across pots', () => {
    const prev = gs({ phase: 'betting', log: [] });
    const next = gs({
      phase: 'handComplete',
      result: { uncontested: false, payouts: [{ seatId: 0, amount: 150, potIndex: 0 }, { seatId: 0, amount: 70, potIndex: 1 }], shown: [] },
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'WIN', heroWon: true, amount: 220, winnerSlot: 'hero' },
    ]);
  });

  it('bot win -> WIN{heroWon:false, winnerSlot: bot slot}', () => {
    const prev = gs({ phase: 'betting', log: [] });
    const next = gs({
      phase: 'handComplete',
      result: { uncontested: false, payouts: [{ seatId: 1, amount: 40, potIndex: 0 }], shown: [] },
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'WIN', heroWon: false, amount: 40, winnerSlot: 'left' },
    ]);
  });

  it('hero stack 0 at handComplete -> HERO_BUST (after WIN)', () => {
    const prev = gs({
      phase: 'betting',
      log: [],
      seats: [
        seat(0, 'You', true, { stack: 0 }),
        seat(1, 'Ava', false, { stack: 800 }),
        seat(2, 'Ben', false),
        seat(3, 'Cleo', false),
      ],
    });
    const next = gs({
      phase: 'handComplete',
      result: { uncontested: false, payouts: [{ seatId: 1, amount: 40, potIndex: 0 }], shown: [] },
      seats: [
        seat(0, 'You', true, { stack: 0 }),
        seat(1, 'Ava', false, { stack: 840 }),
        seat(2, 'Ben', false),
        seat(3, 'Cleo', false),
      ],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'WIN', heroWon: false, amount: 40, winnerSlot: 'left' },
      { type: 'HERO_BUST' },
    ]);
  });

  it('bot status active->out at handComplete -> BOT_OUT{slot} (after WIN)', () => {
    const prev = gs({
      phase: 'betting',
      log: [],
      seats: [
        seat(0, 'You', true),
        seat(1, 'Ava', false),
        seat(2, 'Ben', false, { stack: 40, status: 'active' }),
        seat(3, 'Cleo', false),
      ],
    });
    const next = gs({
      phase: 'handComplete',
      result: { uncontested: false, payouts: [{ seatId: 0, amount: 40, potIndex: 0 }], shown: [] },
      seats: [
        seat(0, 'You', true, { stack: 1040 }),
        seat(1, 'Ava', false),
        seat(2, 'Ben', false, { stack: 0, status: 'out' }),
        seat(3, 'Cleo', false),
      ],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'WIN', heroWon: true, amount: 40, winnerSlot: 'hero' },
      { type: 'BOT_OUT', slot: 'center' },
    ]);
  });

  it('emits ACTION*, SWEEP, STREET_REVEAL, TURN_START in brief order for one street transition', () => {
    const prev = gs({
      street: Street.Preflop,
      board: [],
      toActSeatId: 2,
      log: [{ street: Street.Preflop, action: { type: 'raise', seatId: 1, amount: 40 } }],
      seats: [
        seat(0, 'You', true, { committedThisStreet: 20 }),
        seat(1, 'Ava', false, { committedThisStreet: 40 }),
        seat(2, 'Ben', false, { committedThisStreet: 0 }),
        seat(3, 'Cleo', false, { committedThisStreet: 0 }),
      ],
    });
    const next = gs({
      street: Street.Flop,
      board: [card(2, 'c'), card(9, 'd'), card(14, 's')],
      toActSeatId: 0,
      log: [
        { street: Street.Preflop, action: { type: 'raise', seatId: 1, amount: 40 } },
        { street: Street.Preflop, action: { type: 'call', seatId: 2, amount: 20 } },
      ],
      seats: [
        seat(0, 'You', true, { committedThisStreet: 0 }),
        seat(1, 'Ava', false, { committedThisStreet: 0 }),
        seat(2, 'Ben', false, { committedThisStreet: 0 }),
        seat(3, 'Cleo', false, { committedThisStreet: 0 }),
      ],
    });
    expect(deriveFeelEvents(prev, next)).toEqual([
      { type: 'ACTION', action: 'call', seatId: 2, slot: 'center', amountBB: 1 },
      {
        type: 'SWEEP',
        from: [
          { slot: 'hero', amount: 20 },
          { slot: 'left', amount: 40 },
        ],
      },
      { type: 'STREET_REVEAL', street: Street.Flop, count: 3 },
      { type: 'TURN_START' },
    ]);
  });
});
