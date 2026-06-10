import type { GameState, Pot, Seat } from './types';
import { evaluateHand, type HandRank, compareHandRank } from './evaluator';

/**
 * Compute main + side pots from each seat's total contribution this hand.
 * Folded players' chips count toward pot amounts but they are not eligible to win.
 * Layers with identical eligibility are merged for cleaner display.
 */
export function computeSidePots(seats: Seat[]): Pot[] {
  const contributors = seats.filter((s) => s.committedTotal > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((s) => s.committedTotal))].sort(
    (a, b) => a - b,
  );

  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const layer = level - prev;
    if (layer > 0) {
      const participants = contributors.filter((s) => s.committedTotal >= level);
      const amount = layer * participants.length;
      const eligible = participants
        .filter((s) => s.status !== 'folded' && s.status !== 'out')
        .map((s) => s.id);

      if (eligible.length === 0 && pots.length > 0) {
        // Uncontested layer (everyone who reached it folded): fold into prior pot.
        pots[pots.length - 1].amount += amount;
      } else {
        pots.push({ amount, eligibleSeatIds: eligible });
      }
    }
    prev = level;
  }

  // Merge adjacent pots with identical eligibility.
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligibleSeatIds, pot.eligibleSeatIds)) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot });
    }
  }
  return merged;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

export interface PotAward {
  seatId: number;
  amount: number;
  potIndex: number;
}

/** Order seats by proximity clockwise from the button (for odd-chip assignment). */
function orderFromButton(seatIds: number[], seats: Seat[], buttonSeatId: number): number[] {
  const n = seats.length;
  const idxOf = (id: number) => seats.findIndex((s) => s.id === id);
  const btnIdx = seats.findIndex((s) => s.id === buttonSeatId);
  return [...seatIds].sort((a, b) => {
    const da = (idxOf(a) - btnIdx + n) % n;
    const db = (idxOf(b) - btnIdx + n) % n;
    return da - db;
  });
}

/**
 * Resolve a showdown: for each pot, find the best hand among eligible (non-folded)
 * seats and split it. Odd chips go to the seat closest clockwise from the button.
 * Returns the chip awards (does not mutate input).
 */
export function resolveShowdown(state: GameState): PotAward[] {
  const pots = computeSidePots(state.seats);
  const awards: PotAward[] = [];

  pots.forEach((pot, potIndex) => {
    const contenders = pot.eligibleSeatIds
      .map((id) => state.seats.find((s) => s.id === id)!)
      .filter((s) => s.status !== 'folded' && s.status !== 'out' && s.holeCards.length === 2);

    if (contenders.length === 0) return;

    let bestRank: HandRank | null = null;
    let winners: Seat[] = [];
    for (const seat of contenders) {
      const rank = evaluateHand(seat.holeCards, state.board);
      if (bestRank === null) {
        bestRank = rank;
        winners = [seat];
      } else {
        const cmp = compareHandRank(rank, bestRank);
        if (cmp > 0) {
          bestRank = rank;
          winners = [seat];
        } else if (cmp === 0) {
          winners.push(seat);
        }
      }
    }

    const base = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - base * winners.length;
    const orderedWinnerIds = orderFromButton(
      winners.map((w) => w.id),
      state.seats,
      state.buttonSeatId,
    );
    for (const id of orderedWinnerIds) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      awards.push({ seatId: id, amount: base + extra, potIndex });
    }
  });

  return awards;
}
