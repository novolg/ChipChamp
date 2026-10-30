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

const heroToAct = (game: GameState): boolean => {
  const heroId = game.seats.find((s) => s.isHuman)?.id;
  return game.phase === 'betting' && game.toActSeatId != null && game.toActSeatId === heroId;
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

  // Same-hand only: useTableSfx returns early on a hand-number change before
  // its toAct check, deliberately suppressing the your-turn cue at hand start.
  if (sameHand && !heroToAct(prev) && heroToAct(next)) {
    events.push({ type: 'TURN_START' });
  }

  if (next.phase === 'handComplete' && prev.phase !== 'handComplete') {
    // Featured winner = the hero if they took any share, else the biggest
    // winner (amount summed over every pot that seat won).
    const heroId = next.seats.find((s) => s.isHuman)?.id;
    const bySeat = new Map<number, number>();
    for (const p of next.result?.payouts ?? []) bySeat.set(p.seatId, (bySeat.get(p.seatId) ?? 0) + p.amount);
    const ranked = [...bySeat.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.find(([id]) => id === heroId) ?? ranked[0];
    if (top) {
      events.push({
        type: 'WIN',
        heroWon: top[0] === heroId,
        amount: top[1],
        winnerSlot: slotOfSeat(next, top[0]),
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
