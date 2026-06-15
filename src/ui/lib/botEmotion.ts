import type { Action, GameState, Seat } from '../../engine/types';
import { isShowdown } from './derive';

/** Facial states a bot can hold. Derived, never stored. */
export type Emotion =
  | 'idle'
  | 'thinking'
  | 'confident'
  | 'worried'
  | 'suspicious'
  | 'relief'
  | 'shocked'
  | 'happy'
  | 'sad'
  | 'asleep';

/**
 * Derive a bot's emotion from existing game state — a pure priority cascade
 * (first match wins). No new store fields, no timers, no RNG: fully replayable.
 */
export function deriveEmotion(
  seat: Seat,
  game: GameState,
  isThinking: boolean,
  winners: Set<string>,
  lastActionType?: Action['type'],
): Emotion {
  // 1. Folded seats nap until the next deal.
  if (seat.status === 'folded') return 'asleep';

  // 2. Hand over: winners celebrate; revealed showdown losers droop.
  if (game.phase === 'handComplete') {
    if (winners.has(seat.name)) return 'happy';
    if (isShowdown(game) && (seat.status === 'active' || seat.status === 'allin')) {
      return 'sad';
    }
    return 'idle';
  }

  // 3. All-in: held wide-eyed while at risk.
  if (seat.status === 'allin') return 'shocked';

  // 4. Someone ELSE just shoved: transient shock. Relies on the reducer
  //    appending exactly one log entry per action (true today); the shock
  //    clears deterministically the moment any new entry lands — no timers.
  const last = game.log[game.log.length - 1];
  if (
    last?.action?.type === 'allin' &&
    last.action.seatId !== seat.id &&
    seat.status === 'active'
  ) {
    return 'shocked';
  }

  // 5. Deciding right now.
  if (isThinking) return 'thinking';

  // 6. Just bet or raised: smug for as long as the action bubble shows.
  if (lastActionType === 'bet' || lastActionType === 'raise') return 'confident';

  const owe = game.currentBet - seat.committedThisStreet;
  const facing = game.phase === 'betting' && seat.status === 'active' && owe > 0;

  // 7. Facing moderate aggression — wary, not yet scared. Mutually exclusive with
  //    worried by threshold (handles the below-threshold case that would otherwise
  //    fall through to idle).
  if (facing && owe < 4 * game.bigBlind && owe < 0.3 * seat.stack) {
    return 'suspicious';
  }

  // 8. Facing real pressure: a big bet relative to the blinds or the stack.
  if (facing && (owe >= 4 * game.bigBlind || owe >= 0.3 * seat.stack)) {
    return 'worried';
  }

  return 'idle';
}
