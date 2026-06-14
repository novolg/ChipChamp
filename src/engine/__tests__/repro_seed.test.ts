import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../reducer';
import { decide } from '../../bot/policy';
import { BOT_PRESETS } from '../../bot/botConstants';
import type { GameState } from '../types';

const TABLE: TableConfig = {
  seats: [
    { id: 0, name: 'You', isHuman: true, stack: 1000 },
    { id: 1, name: 'Ava', isHuman: false, stack: 1000 },
    { id: 2, name: 'Ben', isHuman: false, stack: 1000 },
    { id: 3, name: 'Cleo', isHuman: false, stack: 1000 },
  ],
  buttonSeatId: 0,
  smallBlind: 10,
  bigBlind: 20,
  seed: 1,
};

/** Play one hand (everyone uses bot policy) from a given seed; return winners.
 *  `button` rotates so position averages out across seats, as in real play. */
function playHand(seed: number, button = 0): string[] {
  let g: GameState = startHand(createTable({ ...TABLE, seed }), { buttonSeatId: button });
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 80) {
    const seat = g.seats.find((s) => s.id === g.toActSeatId)!;
    g = applyAction(g, decide(g, seat.id, BOT_PRESETS.medium));
  }
  return g.log
    .map((e) => e.note?.match(/^(.+?) wins /)?.[1])
    .filter((n): n is string => !!n);
}

describe('seed fix', () => {
  it('different seeds produce different hands', () => {
    const winners = new Set([playHand(1).join(), playHand(2).join(), playHand(3).join(), playHand(99).join()]);
    expect(winners.size).toBeGreaterThan(1);
  });

  it('no bot is mechanically favored across many random seeds', () => {
    const tally: Record<string, number> = { You: 0, Ava: 0, Ben: 0, Cleo: 0 };
    const N = 4000;
    // Rotate the button across all 4 seats so positional edge averages out.
    for (let s = 1; s <= N; s++) for (const w of playHand(s, s % 4)) tally[w] = (tally[w] ?? 0) + 1;
    console.log('Wins over', N, 'seeds:', tally);
    // The three bots share one config; over thousands of fair shuffles their win
    // counts should be within a modest band of each other (no structural bias).
    const bots = [tally.Ava, tally.Ben, tally.Cleo];
    const spread = Math.max(...bots) / Math.min(...bots);
    expect(spread).toBeLessThan(1.3);
  });
});
