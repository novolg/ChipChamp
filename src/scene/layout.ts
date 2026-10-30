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
  /** Where a seat's bet chips leave from — the bot's hands in its portrait
   *  (they arc from here into `bets`), the hero's plate. */
  hands: Record<SeatSlot, Pt>;
  /** Bot's own chip stack (its `seat.stack`) on the felt beside its plate;
   *  null where there is no room (portrait). Hero's stack lives on its plate. */
  stacks: Record<(typeof BOT_SLOTS)[number], Pt> | null;
}

export const BOT_SLOTS = ['left', 'center', 'right'] as const;

/* Desktop: hand-tuned to the Midnight Indigo target
 * (output/imagegen/chipchamp-dark-variants/01-midnight-indigo.png) — a
 * 1032-wide main column of the 1440x900 frame, big cowboy-bot portraits along
 * the top rail, the felt's lower rail tucking under the action dock.
 * Portrait is the 2026-06-14 mobile block. Single source of truth: the Pixi
 * scene AND the DOM overlay both position from these numbers. `seats` is the
 * bot seat box centre (portrait above, plate at the bottom). */
const LANDSCAPE: TableLayout = {
  size: { w: 1032, h: 620 },
  felt: { cx: 516, cy: 392, rx: 462, ry: 218 },
  seats:     { left: { x: 196, y: 128 }, center: { x: 516, y: 104 }, right: { x: 836, y: 128 }, hero: { x: 516, y: 598 } },
  seatCards: { left: { x: 300, y: 160 }, center: { x: 620, y: 136 }, right: { x: 940, y: 160 }, hero: { x: 516, y: 512 } },
  bets:      { left: { x: 360, y: 262 }, center: { x: 600, y: 240 }, right: { x: 760, y: 262 }, hero: { x: 760, y: 500 } },
  board: { x: 516, y: 372 }, cardW: 70, cardH: 98, boardGap: 12, heroCardW: 104, heroCardH: 146,
  pot: { x: 680, y: 300 }, potLabel: { x: 516, y: 290 }, deck: { x: 852, y: 392 },
  dealer: { left: { x: 292, y: 250 }, center: { x: 444, y: 236 }, right: { x: 692, y: 262 }, hero: { x: 690, y: 562 } },
  hands:     { left: { x: 236, y: 176 }, center: { x: 516, y: 156 }, right: { x: 796, y: 176 }, hero: { x: 516, y: 598 } },
  stacks:    { left: { x: 176, y: 300 }, center: { x: 362, y: 214 }, right: { x: 856, y: 300 } },
};

const PORTRAIT: TableLayout = {
  size: { w: 390, h: 620 },
  // Leave room for the 28px rail plus its shadow inside the canvas.
  felt: { cx: 195, cy: 290, rx: 156, ry: 250 },
  seats:     { left: { x: 90, y: 95 },  center: { x: 195, y: 62 }, right: { x: 300, y: 95 },  hero: { x: 195, y: 560 } },
  seatCards: { left: { x: 90, y: 52 },  center: { x: 195, y: 20 }, right: { x: 300, y: 52 },  hero: { x: 195, y: 470 } },
  bets:      { left: { x: 120, y: 165 }, center: { x: 195, y: 140 }, right: { x: 270, y: 165 }, hero: { x: 195, y: 405 } },
  board: { x: 195, y: 300 }, cardW: 46, cardH: 66, boardGap: 6, heroCardW: 72, heroCardH: 102,
  pot: { x: 195, y: 235 }, potLabel: { x: 195, y: 198 }, deck: { x: 320, y: 300 },
  dealer: { left: { x: 128, y: 120 }, center: { x: 158, y: 105 }, right: { x: 262, y: 120 }, hero: { x: 250, y: 430 } },
  hands:     { left: { x: 90, y: 95 },  center: { x: 195, y: 62 }, right: { x: 300, y: 95 },  hero: { x: 195, y: 560 } },
  stacks: null,
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
