import type { GameState, Seat } from './types';

export interface LegalAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
  /** call: chips added to call. */
  callAmount?: number;
  /** bet/raise: minimum and maximum "to" total for committedThisStreet this action. */
  min?: number;
  max?: number;
  /** allin: the resulting committedThisStreet total. */
  allInTo?: number;
}

export function getSeat(state: GameState, seatId: number): Seat {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error(`No seat with id ${seatId}`);
  return seat;
}

/** Seats still contesting the pot (not folded, not out). */
export function seatsInHand(state: GameState): Seat[] {
  return state.seats.filter((s) => s.status === 'active' || s.status === 'allin');
}

/** Next seat clockwise after `fromId` (any status), by array order with wrap. */
export function seatIndexAfter(state: GameState, fromId: number): number {
  const n = state.seats.length;
  const fromIdx = state.seats.findIndex((s) => s.id === fromId);
  return (fromIdx + 1) % n;
}

/**
 * First seat that still needs to act, walking clockwise starting at the seat
 * AFTER `anchorId`. A seat needs to act if it is active and either hasn't acted
 * this street or hasn't matched the current bet. Returns null when the betting
 * round is complete.
 */
export function nextToAct(state: GameState, anchorId: number): number | null {
  const n = state.seats.length;
  let idx = seatIndexAfter(state, anchorId);
  for (let i = 0; i < n; i++) {
    const seat = state.seats[idx];
    if (
      seat.status === 'active' &&
      (!seat.hasActedThisStreet || seat.committedThisStreet !== state.currentBet)
    ) {
      return seat.id;
    }
    idx = (idx + 1) % n;
  }
  return null;
}

/** Legal actions for the seat whose turn it is. */
export function getLegalActions(state: GameState): LegalAction[] {
  if (state.toActSeatId === null) return [];
  const seat = getSeat(state, state.toActSeatId);
  if (seat.status !== 'active') return [];

  const actions: LegalAction[] = [];
  const toCall = state.currentBet - seat.committedThisStreet;
  const maxTo = seat.committedThisStreet + seat.stack; // all-in "to" total

  // Fold is always legal.
  actions.push({ type: 'fold' });

  if (toCall <= 0) {
    actions.push({ type: 'check' });
  } else {
    actions.push({ type: 'call', callAmount: Math.min(toCall, seat.stack) });
  }

  // Raising/betting is only reopened to seats that haven't acted since the last
  // full raise (a short all-in does not reopen action).
  const canOpenRaise = !seat.hasActedThisStreet || seat.committedThisStreet === state.currentBet;

  if (state.currentBet === 0) {
    // Bet: only when there's no outstanding bet.
    const minBet = Math.min(seat.committedThisStreet + state.minRaise, maxTo);
    if (seat.stack > 0) actions.push({ type: 'bet', min: minBet, max: maxTo });
  } else if (canOpenRaise) {
    const minRaiseTo = state.currentBet + state.minRaise;
    if (maxTo >= minRaiseTo) {
      actions.push({ type: 'raise', min: minRaiseTo, max: maxTo });
    }
  }

  // All-in is always available while the seat has chips (covers short all-ins
  // and short calls).
  if (seat.stack > 0) actions.push({ type: 'allin', allInTo: maxTo });

  return actions;
}
