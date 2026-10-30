// Showdown choreography: the engine resolves a contested hand in ONE step
// (run-out + awards). The UI replays it as timed snapshots so the moment reads:
// hands turn face up → remaining streets deal one by one → the winning five
// light up → chips move and the result shows. Pure — the hook owns the timers.

import { Street, type GameState } from '../../engine/types';

export interface StagedStep {
  /** Snapshot to present while this step holds. */
  game: GameState;
  /** How long it holds at 1× speed (ms). */
  holdMs: number;
}

/** Hands face up, before any run-out card. */
export const REVEAL_MS = 900;
/** Each run-out street (flop / turn / river) after an all-in. */
export const RUNOUT_MS = 1000;
/** Winning five highlighted before the payout. */
export const HIGHLIGHT_MS = 1500;

/**
 * Steps between `prev` (last live snapshot) and `final` (engine's
 * handComplete). Empty when there is nothing to stage: a folded-out pot, a
 * different hand, or a state that is not a fresh showdown.
 */
export function showdownSteps(prev: GameState, final: GameState): StagedStep[] {
  const result = final.result;
  if (
    !result ||
    result.uncontested ||
    final.phase !== 'handComplete' ||
    prev.phase === 'handComplete' ||
    prev.handNumber !== final.handNumber
  ) {
    return [];
  }

  // Undo the awards so stacks only grow at the payout.
  const won = new Map<number, number>();
  for (const p of result.payouts) won.set(p.seatId, (won.get(p.seatId) ?? 0) + p.amount);
  const snap = (boardLen: number, withResult: boolean): GameState => ({
    ...final,
    phase: 'showdown',
    street: Street.Showdown,
    board: final.board.slice(0, boardLen),
    result: withResult ? result : null,
    seats: final.seats.map((s) => ({ ...s, stack: s.stack - (won.get(s.id) ?? 0), committedThisStreet: 0 })),
  });

  const steps: StagedStep[] = [{ game: snap(prev.board.length, false), holdMs: REVEAL_MS }];
  for (const len of [3, 4, 5]) {
    if (len > prev.board.length && len <= final.board.length) {
      steps.push({ game: snap(len, false), holdMs: RUNOUT_MS });
    }
  }
  steps.push({ game: snap(final.board.length, true), holdMs: HIGHLIGHT_MS });
  return steps;
}
