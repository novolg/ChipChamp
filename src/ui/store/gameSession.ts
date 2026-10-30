import { applyAction, createTable, startHand, type TableConfig } from '../../engine/reducer';
import type { Action, GameState } from '../../engine/types';
import { reviewDecision, type DecisionReview } from '../../tutorial/decisionReview';

export const SESSION_KEY = 'chipchamp.table.v1';
export interface GameSession {
  version: 1;
  table: TableConfig;
  handNumber: number;
  difficulty: 'easy' | 'medium' | 'hard';
  actions: Action[];
  recorded: boolean;
}

/** Store only the current hand's starting configuration and legal actions.
 * Replaying through the engine validates the saved game without trusting decks,
 * pots or payouts deserialized from storage. Size stays bounded per hand. */
export function beginSession(game: GameState, difficulty: GameSession['difficulty']): GameSession {
  return { version: 1, table: { seats: game.seats.map(({ id, name, isHuman, stack }) => ({ id, name, isHuman, stack })), buttonSeatId: game.buttonSeatId, smallBlind: game.smallBlind, bigBlind: game.bigBlind, seed: game.rngState }, handNumber: game.handNumber + 1, difficulty, actions: [], recorded: false };
}

export function restoreSession(raw: string): { session: GameSession; game: GameState; review: DecisionReview | null } | null {
  try {
    const s: GameSession = JSON.parse(raw);
    const integer = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
    if (s.version !== 1 || !['easy', 'medium', 'hard'].includes(s.difficulty) || typeof s.recorded !== 'boolean' || !integer(s.handNumber) || s.handNumber < 1 || !Array.isArray(s.actions) || s.actions.length > 10000) return null;
    const t = s.table;
    if (!t || !Array.isArray(t.seats) || t.seats.length < 2 || t.seats.length > 4 || !Number.isInteger(t.seed) || t.seed < -2147483648 || t.seed > 2147483647 || t.smallBlind !== 10 || t.bigBlind !== 20) return null;
    if (t.seats.some((p) => !integer(p.id) || typeof p.name !== 'string' || p.name.length > 40 || typeof p.isHuman !== 'boolean' || !integer(p.stack) || p.stack > 4000)) return null;
    if (new Set(t.seats.map((p) => p.id)).size !== t.seats.length || t.seats.filter((p) => p.isHuman).length !== 1 || !t.seats.some((p) => p.id === t.buttonSeatId)) return null;
    if (t.seats.reduce((sum, p) => sum + p.stack, 0) !== t.seats.length * 1000) return null;
    let game = startHand({ ...createTable(t), handNumber: s.handNumber - 1 });
    let review: DecisionReview | null = null;
    for (const action of s.actions) {
      if (!action || !['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(action.type) || !integer(action.seatId) || (action.amount !== undefined && (!integer(action.amount) || action.amount > 4000))) return null;
      review = reviewDecision(game, action) ?? review;
      game = applyAction(game, action);
    }
    if (s.recorded && game.phase !== 'handComplete') return null;
    return { session: s, game, review };
  } catch { return null; }
}

export function loadSession() {
  try { return restoreSession(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}

export function saveSession(session: GameSession): boolean {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); return true; } catch { return false; }
}
