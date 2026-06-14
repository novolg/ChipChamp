import { describe, it, expect } from 'vitest';
import { decide } from '../policy';
import { BOT_PRESETS } from '../botConstants';
import {
  createTable,
  startHand,
  applyAction,
  type TableConfig,
} from '../../engine/reducer';
import { getLegalActions, type LegalAction } from '../../engine/betting';
import { buildStackedDeck } from '../../engine/deck';
import type { Action, Card, GameState, Seat } from '../../engine/types';
import { Street } from '../../engine/types';

const c = (r: number, s: string): Card => ({ rank: r as Card['rank'], suit: s as Card['suit'] });

function isLegal(action: Action, legal: LegalAction[]): boolean {
  const match = legal.find((l) => l.type === action.type);
  if (!match) return false;
  if (action.type === 'bet' || action.type === 'raise') {
    const amt = action.amount ?? -1;
    return amt >= (match.min ?? 0) && amt <= (match.max ?? Infinity);
  }
  return true;
}

function table(stacks: number[], button = 0): TableConfig {
  return {
    seats: stacks.map((stack, i) => ({ id: i, name: `S${i}`, isHuman: false, stack })),
    buttonSeatId: button,
    smallBlind: 10,
    bigBlind: 20,
    seed: 7,
  };
}

describe('preflop decisions', () => {
  it('folds trash facing a raise', () => {
    // 3-handed, button (seat 0) acts first preflop. Give it 7-2 offsuit.
    const deck = buildStackedDeck({
      dealOrder: [1, 2, 0],
      holeCards: {
        0: [c(7, 'd'), c(2, 'c')],
        1: [c(9, 's'), c(4, 'h')],
        2: [c(10, 'c'), c(3, 'd')],
      },
      board: [],
    });
    const s = startHand(createTable(table([1000, 1000, 1000])), { deck });
    expect(s.toActSeatId).toBe(0);
    const action = decide(s, 0, { ...BOT_PRESETS.medium, bluffFreq: 0 });
    expect(action.type).toBe('fold');
  });

  it('raises with a premium hand', () => {
    const deck = buildStackedDeck({
      dealOrder: [1, 2, 0],
      holeCards: {
        0: [c(14, 's'), c(14, 'h')], // pocket aces
        1: [c(9, 's'), c(4, 'h')],
        2: [c(10, 'c'), c(3, 'd')],
      },
      board: [],
    });
    const s = startHand(createTable(table([1000, 1000, 1000])), { deck });
    const action = decide(s, 0, BOT_PRESETS.medium);
    expect(['raise', 'allin']).toContain(action.type);
    expect(isLegal(action, getLegalActions(s))).toBe(true);
  });
});

describe('postflop decisions', () => {
  function postflopState(): GameState {
    const seats: Seat[] = [
      {
        id: 0, name: 'Hero', isHuman: false, stack: 980,
        holeCards: [c(14, 'c'), c(7, 'c')], // top pair of aces
        committedThisStreet: 0, committedTotal: 20, status: 'active', hasActedThisStreet: false,
      },
      {
        id: 1, name: 'Villain', isHuman: false, stack: 960,
        holeCards: [c(9, 'h'), c(8, 'h')],
        committedThisStreet: 20, committedTotal: 40, status: 'active', hasActedThisStreet: true,
      },
    ];
    return {
      seats, buttonSeatId: 1, smallBlind: 10, bigBlind: 20,
      street: Street.Flop, board: [c(14, 'h'), c(13, 'd'), c(5, 's')],
      deck: [], pots: [{ amount: 80, eligibleSeatIds: [0, 1] }],
      toActSeatId: 0, currentBet: 20, minRaise: 20, lastAggressorSeatId: 1,
      lastFullRaiseLevel: 20, rngState: 3, handNumber: 1, log: [], phase: 'betting',
    };
  }

  it('calls top pair when the pot odds are favourable', () => {
    const s = postflopState();
    const action = decide(s, 0, { ...BOT_PRESETS.medium, aggression: 0 });
    expect(['call', 'raise']).toContain(action.type);
    expect(action.type).not.toBe('fold');
    expect(isLegal(action, getLegalActions(s))).toBe(true);
  });

  it('does not fold a non-top made pair that is getting the right price', () => {
    const seats: Seat[] = [
      {
        id: 0, name: 'Hero', isHuman: false, stack: 980,
        holeCards: [c(9, 'c'), c(4, 'h')], // middle pair (pair of 9s), not top pair
        committedThisStreet: 0, committedTotal: 20, status: 'active', hasActedThisStreet: false,
      },
      {
        id: 1, name: 'Villain', isHuman: false, stack: 760,
        holeCards: [c(14, 's'), c(13, 'd')],
        committedThisStreet: 20, committedTotal: 40, status: 'active', hasActedThisStreet: true,
      },
    ];
    const s: GameState = {
      seats, buttonSeatId: 1, smallBlind: 10, bigBlind: 20,
      street: Street.Flop, board: [c(14, 'h'), c(9, 'd'), c(5, 's')],
      deck: [], pots: [{ amount: 200, eligibleSeatIds: [0, 1] }],
      toActSeatId: 0, currentBet: 20, minRaise: 20, lastAggressorSeatId: 1,
      lastFullRaiseLevel: 20, rngState: 3, handNumber: 1, log: [], phase: 'betting',
    };
    const action = decide(s, 0, { ...BOT_PRESETS.medium, aggression: 0, bluffFreq: 0 });
    expect(action.type).not.toBe('fold');
    expect(isLegal(action, getLegalActions(s))).toBe(true);
  });
});

describe('legality fuzz', () => {
  it('never produces an illegal action across many simulated hands', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let state = createTable({ ...table([1000, 1000, 1000, 1000]), seed });
      let safety = 0;
      for (let hand = 0; hand < 20; hand++) {
        const withChips = state.seats.filter((s) => s.stack > 0);
        if (withChips.length < 2) break;
        state = startHand(state, { buttonSeatId: nextButton(state) });

        while (state.phase === 'betting' && state.toActSeatId !== null) {
          if (++safety > 5000) throw new Error('Simulation did not terminate');
          const legal = getLegalActions(state);
          const action = decide(state, state.toActSeatId, BOT_PRESETS.hard);
          expect(isLegal(action, legal)).toBe(true);
          state = applyAction(state, action);
        }
        expect(state.phase).toBe('handComplete');
      }
    }
  });
});

function nextButton(state: GameState): number {
  const n = state.seats.length;
  let i = (state.seats.findIndex((s) => s.id === state.buttonSeatId) + 1) % n;
  for (let k = 0; k < n; k++) {
    if (state.seats[i].stack > 0) return state.seats[i].id;
    i = (i + 1) % n;
  }
  return state.buttonSeatId;
}
