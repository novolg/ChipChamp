import type { Card, GameState } from '../../engine/types';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { isStepComplete } from '../../tutorial/progress/progressReducer';
import type { Progress } from '../../tutorial/types';

const key = (c: Card) => `${c.rank}${c.suit}`;

/** Seat ids of the small and big blind for the current hand (for display badges). */
export function blindSeats(game: GameState): { sb: number | null; bb: number | null } {
  const occupied = game.seats.filter((s) => s.status !== 'out');
  if (occupied.length < 2) return { sb: null, bb: null };
  const btnIdx = occupied.findIndex((s) => s.id === game.buttonSeatId);
  if (occupied.length === 2) {
    // Heads-up: button is the small blind.
    const other = occupied.find((s) => s.id !== game.buttonSeatId)!;
    return { sb: game.buttonSeatId, bb: other.id };
  }
  const sb = occupied[(btnIdx + 1) % occupied.length].id;
  const bb = occupied[(btnIdx + 2) % occupied.length].id;
  return { sb, bb };
}

/** Should this hand reveal opponents' hole cards? (Showdown with 2+ players left.) */
export function isShowdown(game: GameState): boolean {
  if (game.phase !== 'handComplete' && game.phase !== 'showdown') return false;
  const contesting = game.seats.filter((s) => s.status === 'active' || s.status === 'allin');
  return contesting.length >= 2;
}

/** The set of card keys forming the winning hand(s) at showdown, for
 *  highlighting — every seat that won any pot (side-pot winners included).
 *  Empty until the engine's result exists (and while the showdown is staged). */
export function winningCardKeys(game: GameState): Set<string> {
  const keys = new Set<string>();
  if (!isShowdown(game) || !game.result) return keys;
  const winners = new Set(game.result.payouts.map((p) => p.seatId));
  for (const h of game.result.shown) {
    if (winners.has(h.seatId)) for (const c of h.rank.cards) keys.add(key(c));
  }
  return keys;
}

/** Names of this hand's winners (from the engine's structured result). */
export function winnerNames(game: GameState): Set<string> {
  const ids = new Set(game.result?.payouts.map((p) => p.seatId) ?? []);
  return new Set(game.seats.filter((s) => ids.has(s.id)).map((s) => s.name));
}

/** The human seat is out of chips. (Caller gates on handComplete; during an
 *  all-in the hero can sit at 0 while still live, so this is read at hand end.) */
export function heroIsBusted(game: GameState): boolean {
  const hero = game.seats.find((s) => s.isHuman);
  return !!hero && hero.stack === 0;
}

/** Whether another hand can be dealt. This is a single-player game: once the
 *  hero is out of chips the session ends, even though the bots could keep
 *  playing among themselves. Dealing a chip-less hero seats them 'out' with no
 *  hole cards, which renders as placeholder cards on the felt. */
export function canDealNextHand(game: GameState): boolean {
  const hero = game.seats.find((s) => s.isHuman);
  if (!hero || hero.stack === 0) return false;
  return game.seats.filter((s) => s.stack > 0).length >= 2;
}

/** Count of learning-path steps completed so far. Single source of truth for
 *  both the HUD level ring (AppFrame.tsx) and the felt's hero avatar level
 *  badge (TableScene.tsx) — they must never drift apart. */
export function completedStepCount(progress: Progress): number {
  return LEARNING_PATH.filter((step) => isStepComplete(step, progress, QUIZZES_BY_ID)).length;
}

/** The learner's displayed level: one more than steps completed, so a fresh
 *  learner starts at level 1. */
export function learnerLevel(progress: Progress): number {
  return completedStepCount(progress) + 1;
}

/** The hero's live chip stack, or `startingStack` before the first deal
 *  (`game === null`, i.e. pre-first-hand or between sessions). */
export function heroChipBalance(game: GameState | null, startingStack: number): number {
  if (!game) return startingStack;
  const hero = game.seats.find((s) => s.isHuman);
  return hero ? hero.stack : startingStack;
}
