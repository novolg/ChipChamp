import { advise } from '../advisor/advisor';
import type { Action, GameState } from '../engine/types';

export interface DecisionReview {
  street: string;
  played: string;
  suggested: string;
  reasoning: string;
  matched: boolean;
}
/** Capture advice before the action: the final board must not influence it. */
export function reviewDecision(game: GameState, action: Action): DecisionReview | null {
  if (game.phase !== 'betting' || game.toActSeatId !== action.seatId || !game.seats.find((s) => s.id === action.seatId)?.isHuman) return null;
  const advice = advise(game, action.seatId);
  return { street: game.street, played: action.type, suggested: advice.suggestedAction, reasoning: advice.reasoning, matched: action.type === advice.suggestedAction };
}
