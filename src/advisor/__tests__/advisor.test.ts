import { describe, it, expect } from 'vitest';
import { advise } from '../advisor';
import { getLegalActions } from '../../engine/betting';
import type { Card, GameState, Seat } from '../../engine/types';
import { Street } from '../../engine/types';

const c = (r: number, s: string): Card => ({ rank: r as Card['rank'], suit: s as Card['suit'] });

function makeState(over: Partial<GameState>, hero: Partial<Seat>, villainCommitted = 0): GameState {
  const seats: Seat[] = [
    {
      id: 0, name: 'Hero', isHuman: true, stack: 1000,
      holeCards: hero.holeCards ?? [c(14, 's'), c(14, 'h')],
      committedThisStreet: 0, committedTotal: hero.committedTotal ?? 0,
      status: 'active', hasActedThisStreet: false, ...hero,
    },
    {
      id: 1, name: 'Villain', isHuman: false, stack: 1000,
      holeCards: [c(9, 'h'), c(8, 'd')],
      committedThisStreet: villainCommitted, committedTotal: villainCommitted,
      status: 'active', hasActedThisStreet: true,
    },
  ];
  return {
    seats, buttonSeatId: 1, smallBlind: 10, bigBlind: 20,
    street: Street.Preflop, board: [], deck: [],
    pots: [{ amount: 30, eligibleSeatIds: [0, 1] }],
    toActSeatId: 0, currentBet: villainCommitted, minRaise: 20,
    lastAggressorSeatId: 1, lastFullRaiseLevel: 20, rngState: 1, handNumber: 1,
    log: [], phase: 'betting', ...over,
  };
}

function suggestionIsLegal(state: GameState, action: string): boolean {
  return getLegalActions(state).some((a) => a.type === action);
}

describe('advisor', () => {
  it('recommends raising premium hands preflop', () => {
    const s = makeState({ currentBet: 20 }, { holeCards: [c(14, 's'), c(14, 'h')] }, 20);
    const advice = advise(s, 0);
    expect(['raise', 'bet']).toContain(advice.suggestedAction);
    expect(advice.confidence).toBe('high');
    expect(suggestionIsLegal(s, advice.suggestedAction)).toBe(true);
  });

  it('recommends folding trash preflop facing a raise', () => {
    const s = makeState({ currentBet: 60 }, { holeCards: [c(7, 'd'), c(2, 'c')] }, 60);
    const advice = advise(s, 0);
    expect(advice.suggestedAction).toBe('fold');
  });

  it('explains a profitable call using equity and pot odds', () => {
    // Top pair on the flop facing a small bet → equity > pot odds → call.
    const s = makeState(
      {
        street: Street.Flop,
        board: [c(14, 'd'), c(13, 'c'), c(5, 's')],
        currentBet: 20,
        pots: [{ amount: 200, eligibleSeatIds: [0, 1] }],
      },
      { holeCards: [c(14, 'c'), c(6, 'c')] },
      20,
    );
    const advice = advise(s, 0);
    expect(advice.suggestedAction).toBe('call');
    expect(advice.reasoning).toMatch(/equity/i);
    expect(advice.reasoning).toMatch(/%/);
    expect(advice.potOdds).toBeGreaterThan(0);
    expect(suggestionIsLegal(s, advice.suggestedAction)).toBe(true);
  });

  it('always references equity in the detail breakdown', () => {
    const s = makeState({ currentBet: 20 }, {}, 20);
    const advice = advise(s, 0);
    expect(advice.detail.some((d) => /equity/i.test(d))).toBe(true);
  });

  it('calls a non-top made pair when equity beats the pot odds (no longer auto-folds)', () => {
    const s = makeState(
      {
        street: Street.Flop,
        board: [c(14, 's'), c(9, 'd'), c(5, 'c')],
        currentBet: 20,
        pots: [{ amount: 200, eligibleSeatIds: [0, 1] }],
      },
      { holeCards: [c(9, 'c'), c(4, 'h')] }, // middle pair (pair of 9s), not top pair
      20,
    );
    const advice = advise(s, 0);
    expect(advice.suggestedAction).toBe('call');
    expect(advice.reasoning).toMatch(/equity/i);
  });

  it('does not show a "draw" detail line when the hand is already a strong made hand', () => {
    const s = makeState(
      {
        street: Street.Turn,
        board: [c(14, 's'), c(13, 'd'), c(5, 'h'), c(7, 'h')],
        currentBet: 0,
        pots: [{ amount: 100, eligibleSeatIds: [0, 1] }],
      },
      { holeCards: [c(14, 'h'), c(13, 'h')] }, // two pair (AA+KK) carrying a 4-card heart flush draw
      0,
    );
    const advice = advise(s, 0);
    expect(advice.reasoning).toMatch(/strong made hand/i);
    expect(advice.detail.some((d) => /draw/i.test(d))).toBe(false);
  });
});
