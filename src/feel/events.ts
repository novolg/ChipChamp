// Pure derivation of "feel" (cosmetic/SFX-adjacent) events from GameState
// snapshot diffs. No React, no Date, no Math.random — the caller (a hook)
// owns timing/scheduling; this module only decides WHAT happened between
// two snapshots. Ported from useTableSfx's snapshot diff, Table.tsx's sweep
// ghost logic, and FreePlayScreen's winInfo parsing.

import type { ActionType, GameState, Street } from '../engine/types';
import { slotOfSeat, type SeatSlot } from '../scene/layout';

export type FeelEvent =
  | { type: 'HAND_START'; handNumber: number }
  | { type: 'STREET_REVEAL'; street: Street; count: 1 | 3 }
  | { type: 'ACTION'; action: ActionType; seatId: number; slot: SeatSlot; amountBB: number }
  | { type: 'TURN_START' } // hero's turn began
  | { type: 'SWEEP'; from: { slot: SeatSlot; amount: number }[] }
  | { type: 'WIN'; heroWon: boolean; amount: number; winnerSlot: SeatSlot }
  | { type: 'HERO_BUST' }
  | { type: 'BOT_OUT'; slot: SeatSlot };

// Matches the same "<name> wins <amount>" prefix FreePlayScreen's winInfo and
// useTableSfx's heroWinAmount parse (trailing " with <hand>" is ignored here).
const WIN_RE = /^(.+?) wins (\d+)/;

const heroToAct = (game: GameState): boolean => {
  const heroId = game.seats.find((s) => s.isHuman)?.id;
  return game.phase === 'betting' && game.toActSeatId != null && game.toActSeatId === heroId;
};

/** Resolve a "<name> wins" log-note name to the slot of the seat that won,
 *  same convention as FreePlayScreen's winnerSlot (hero matched by "You"). */
const winnerSeatSlot = (game: GameState, name: string): SeatSlot => {
  const seat = game.seats.find((s) => (name === 'You' ? s.isHuman : s.name === name));
  return seat ? slotOfSeat(game, seat.id) : 'hero';
};

export function deriveFeelEvents(prev: GameState | null, next: GameState): FeelEvent[] {
  // First observation (mount/remount/nav): sync silently, react only to changes.
  if (!prev) return [];

  const events: FeelEvent[] = [];
  const sameHand = next.handNumber === prev.handNumber;

  if (!sameHand) {
    events.push({ type: 'HAND_START', handNumber: next.handNumber });
  }

  for (const entry of next.log.slice(prev.log.length)) {
    const a = entry.action;
    if (a && a.type !== 'postBlind') {
      events.push({
        type: 'ACTION',
        action: a.type,
        seatId: a.seatId,
        slot: slotOfSeat(next, a.seatId),
        amountBB: (a.amount ?? 0) / next.bigBlind,
      });
    }
  }

  if (sameHand && next.street !== prev.street) {
    const from = prev.seats
      .filter((s) => s.committedThisStreet > 0)
      .map((s) => ({ slot: slotOfSeat(prev, s.id), amount: s.committedThisStreet }));
    if (from.length > 0) events.push({ type: 'SWEEP', from });
  }

  if (sameHand && next.board.length > prev.board.length) {
    const count = next.board.length - prev.board.length;
    events.push({ type: 'STREET_REVEAL', street: next.street, count: count === 3 ? 3 : 1 });
  }

  if (!heroToAct(prev) && heroToAct(next)) {
    events.push({ type: 'TURN_START' });
  }

  if (next.phase === 'handComplete' && prev.phase !== 'handComplete') {
    const wins = next.log
      .map((e) => e.note?.match(WIN_RE))
      .filter((m): m is RegExpMatchArray => m != null);
    if (wins.length > 0) {
      const heroWin = wins.find((m) => m[1] === 'You');
      const top = heroWin ?? wins[0];
      const amount = wins
        .filter((m) => m[1] === top[1])
        .reduce((sum, m) => sum + Number(m[2]), 0);
      events.push({
        type: 'WIN',
        heroWon: Boolean(heroWin),
        amount,
        winnerSlot: winnerSeatSlot(next, top[1]),
      });
    }

    for (const seat of next.seats) {
      if (seat.isHuman) continue;
      const prevSeat = prev.seats.find((s) => s.id === seat.id);
      if (prevSeat && prevSeat.status !== 'out' && seat.status === 'out') {
        events.push({ type: 'BOT_OUT', slot: slotOfSeat(next, seat.id) });
      }
    }

    const hero = next.seats.find((s) => s.isHuman);
    if (hero && hero.stack === 0) {
      events.push({ type: 'HERO_BUST' });
    }
  }

  return events;
}
