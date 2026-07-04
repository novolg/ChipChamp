import type { GameState } from '../engine/types';

export type LayoutMode = 'landscape' | 'portrait';
export type SeatSlot = 'left' | 'center' | 'right' | 'hero';
export interface Pt { x: number; y: number }
export interface TableLayout {
  size: { w: number; h: number };
  felt: { cx: number; cy: number; rx: number; ry: number };
  seats: Record<SeatSlot, Pt>;
  seatCards: Record<SeatSlot, Pt>;
  bets: Record<SeatSlot, Pt>;
  board: Pt;
  cardW: number; cardH: number; boardGap: number; heroCardW: number; heroCardH: number;
  /** `pot` is the physical Pixi chip-stack anchor (bottom disc; stack grows
   *  upward). `potLabel` anchors the DOM "TOTAL POT" capsule and sits well
   *  ABOVE `pot` on purpose, so the capsule clears the physical stack instead
   *  of overlapping it (the stack's top otherwise pokes above the capsule).
   *  Scene-only: the DOM-fallback (Board.tsx) lays the capsule out with flex. */
  pot: Pt; potLabel: Pt; deck: Pt;
  dealer: Record<SeatSlot, Pt>;
}

export const BOT_SLOTS = ['left', 'center', 'right'] as const;

/* Hand-tuned to match the existing DOM table (desktop) and the 2026-06-14
 * portrait mobile block. Single source of truth: the Pixi scene AND the DOM
 * overlay both position from these numbers. */
const LANDSCAPE: TableLayout = {
  size: { w: 1240, h: 660 },
  felt: { cx: 620, cy: 310, rx: 470, ry: 240 },
  seats:     { left: { x: 275, y: 120 }, center: { x: 620, y: 78 }, right: { x: 965, y: 120 }, hero: { x: 620, y: 610 } },
  seatCards: { left: { x: 275, y: 68 },  center: { x: 620, y: 30 }, right: { x: 965, y: 68 },  hero: { x: 620, y: 520 } },
  bets:      { left: { x: 390, y: 205 }, center: { x: 620, y: 178 }, right: { x: 850, y: 205 }, hero: { x: 620, y: 445 } },
  board: { x: 620, y: 315 }, cardW: 62, cardH: 88, boardGap: 10, heroCardW: 92, heroCardH: 130,
  pot: { x: 620, y: 245 }, potLabel: { x: 620, y: 206 }, deck: { x: 905, y: 330 },
  dealer: { left: { x: 350, y: 165 }, center: { x: 555, y: 148 }, right: { x: 890, y: 165 }, hero: { x: 700, y: 470 } },
};

const PORTRAIT: TableLayout = {
  size: { w: 390, h: 620 },
  felt: { cx: 195, cy: 290, rx: 172, ry: 250 },
  seats:     { left: { x: 90, y: 95 },  center: { x: 195, y: 62 }, right: { x: 300, y: 95 },  hero: { x: 195, y: 560 } },
  seatCards: { left: { x: 90, y: 52 },  center: { x: 195, y: 20 }, right: { x: 300, y: 52 },  hero: { x: 195, y: 470 } },
  bets:      { left: { x: 120, y: 165 }, center: { x: 195, y: 140 }, right: { x: 270, y: 165 }, hero: { x: 195, y: 405 } },
  board: { x: 195, y: 300 }, cardW: 46, cardH: 66, boardGap: 6, heroCardW: 72, heroCardH: 102,
  pot: { x: 195, y: 235 }, potLabel: { x: 195, y: 198 }, deck: { x: 320, y: 300 },
  dealer: { left: { x: 128, y: 120 }, center: { x: 158, y: 105 }, right: { x: 262, y: 120 }, hero: { x: 250, y: 430 } },
};

export function tableLayout(mode: LayoutMode): TableLayout {
  return mode === 'portrait' ? PORTRAIT : LANDSCAPE;
}

/** Same seat→slot convention as Table.tsx/FreePlayScreen (bots in seat order). */
export function slotOfSeat(game: GameState, seatId: number): SeatSlot {
  const seat = game.seats.find((s) => s.id === seatId);
  if (!seat || seat.isHuman) return 'hero';
  const bots = game.seats.filter((s) => !s.isHuman);
  return BOT_SLOTS[bots.indexOf(seat)] ?? 'hero';
}
