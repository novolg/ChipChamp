import { describe, expect, it } from 'vitest';
import { tableLayout, slotOfSeat, BOT_SLOTS } from '../layout';
import type { GameState } from '../../engine/types';

const modes = ['landscape', 'portrait'] as const;

describe('tableLayout', () => {
  it.each(modes)('%s: all anchor points are inside the world bounds', (mode) => {
    const L = tableLayout(mode);
    const pts = [
      ...Object.values(L.seats), ...Object.values(L.seatCards), ...Object.values(L.bets),
      ...Object.values(L.dealer), L.board, L.pot, L.potLabel, L.deck,
    ];
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(L.size.w);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(L.size.h);
    }
  });
  it.each(modes)('%s: bet points sit between their seat-card point and the pot', (mode) => {
    const L = tableLayout(mode);
    for (const slot of [...BOT_SLOTS, 'hero'] as const) {
      const s = L.seatCards[slot], b = L.bets[slot], p = L.pot;
      const d = (a: {x:number;y:number}, c: {x:number;y:number}) => Math.hypot(a.x - c.x, a.y - c.y);
      expect(d(b, p)).toBeLessThan(d(s, p));   // bet is closer to pot than the seat is
    }
  });
  it('portrait world is taller than wide; landscape is wider than tall', () => {
    const l = tableLayout('landscape'), p = tableLayout('portrait');
    expect(l.size.w).toBeGreaterThan(l.size.h);
    expect(p.size.h).toBeGreaterThan(p.size.w);
  });
});

describe('slotOfSeat', () => {
  const game = {
    seats: [
      { id: 0, isHuman: true }, { id: 1, isHuman: false },
      { id: 2, isHuman: false }, { id: 3, isHuman: false },
    ],
  } as unknown as GameState;
  it('maps hero and bots in seat order', () => {
    expect(slotOfSeat(game, 0)).toBe('hero');
    expect(slotOfSeat(game, 1)).toBe('left');
    expect(slotOfSeat(game, 2)).toBe('center');
    expect(slotOfSeat(game, 3)).toBe('right');
  });
});
