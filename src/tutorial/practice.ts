import { createTable, startHand, applyAction } from '../engine/reducer';
import { buildStackedDeck } from '../engine/deck';
import { decide } from '../bot/policy';
import type { Action, GameState } from '../engine/types';
import type { ScriptedHand } from './types';

export interface PracticeState {
  game: GameState;
  heroId: number;
}

export interface PracticeDecision {
  state: PracticeState;
  correct: boolean;
  explanation: string;
  action: Action;
  chipsCommitted: number;
  stackBefore: number;
  stackAfter: number;
}

/** Apply the actual move, then pause for teaching feedback. Opponents do not
 * auto-play here: these exercises assess a single decision, not its runout. */
export function submitPracticeDecision(hand: ScriptedHand, state: PracticeState, action: Action): PracticeDecision {
  const { game, heroId } = state;
  if (game.phase !== 'betting' || game.toActSeatId !== heroId || action.seatId !== heroId) {
    throw new Error('Practice decisions must be made by the hero on their turn.');
  }
  const checkpoint = hand.checkpoints.find((c) => c.atStreet === game.street);
  if (!checkpoint) throw new Error('No practice checkpoint for this street.');
  const before = game.seats.find((s) => s.id === heroId)!;
  const next = applyAction(game, action);
  const after = next.seats.find((s) => s.id === heroId)!;
  const correct = action.type === checkpoint.recommended || (checkpoint.acceptable?.includes(action.type) ?? false);
  return {
    state: { game: next, heroId }, correct,
    explanation: correct ? checkpoint.explainRight : checkpoint.explainWrong,
    action: { ...action }, chipsCommitted: after.committedTotal - before.committedTotal,
    stackBefore: before.stack, stackAfter: after.stack,
  };
}

/** Occupied seats clockwise starting left of the button (matches engine deal order). */
export function dealOrder(seatIds: number[], buttonId: number): number[] {
  const n = seatIds.length;
  const bi = seatIds.indexOf(buttonId);
  return Array.from({ length: n }, (_, k) => seatIds[(bi + 1 + k) % n]);
}

/**
 * Build a scripted hand's initial game state and auto-play bot actions (scripted
 * queue first, then the live bot) until it is the hero's turn. Reuses the exact
 * same engine code path as free play, just with a pre-stacked deck.
 */
export function buildScriptedGame(hand: ScriptedHand): PracticeState {
  const { setup } = hand;
  const heroId = setup.seats.find((s) => s.isHuman)!.id;
  const deck = buildStackedDeck({
    dealOrder: dealOrder(setup.seats.map((s) => s.id), setup.buttonSeatId),
    holeCards: setup.holeCards,
    board: setup.board,
  });
  const table = createTable({
    seats: setup.seats,
    buttonSeatId: setup.buttonSeatId,
    smallBlind: setup.smallBlind,
    bigBlind: setup.bigBlind,
    seed: 1,
  });
  let game = startHand(table, { deck, buttonSeatId: setup.buttonSeatId });

  const queue = [...(setup.scriptedBotActions ?? [])];
  let guard = 0;
  while (
    game.phase === 'betting' &&
    game.toActSeatId !== null &&
    game.toActSeatId !== heroId &&
    guard++ < 50
  ) {
    const seatId = game.toActSeatId;
    const scripted = queue.shift();
    const action: Action = scripted ? { ...scripted, seatId } : decide(game, seatId);
    game = applyAction(game, action);
  }
  return { game, heroId };
}
