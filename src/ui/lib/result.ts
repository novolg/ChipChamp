// Read-side helpers over the engine's structured `GameState.result` — who won,
// how much, with what — plus the coach's one-line post-hand summary. Pure.

import type { Card, GameState, HandResult, Rank } from '../../engine/types';
import { compareHandRank, HandCategory, type HandRank } from '../../engine/evaluator';

export interface Winner {
  seatId: number;
  /** Total won across every pot this seat took a share of. */
  amount: number;
}

/** Winners with their total take, biggest first (payout order breaks ties). */
export function winnersOf(result: HandResult | null | undefined): Winner[] {
  if (!result) return [];
  const bySeat = new Map<number, number>();
  for (const p of result.payouts) bySeat.set(p.seatId, (bySeat.get(p.seatId) ?? 0) + p.amount);
  return [...bySeat.entries()]
    .map(([seatId, amount]) => ({ seatId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Main pot shared by 2+ seats. */
export function isSplitPot(result: HandResult | null | undefined): boolean {
  return !!result && result.payouts.filter((p) => p.potIndex === 0).length > 1;
}

/** The winner the banner/celebration features: the hero if they won anything. */
export function featuredWinner(game: GameState): Winner | null {
  const heroId = game.seats.find((s) => s.isHuman)?.id;
  const winners = winnersOf(game.result);
  return winners.find((w) => w.seatId === heroId) ?? winners[0] ?? null;
}

const RANK_NAME: Record<Rank, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};
const plural = (r: number) => (r === 6 ? 'Sixes' : `${RANK_NAME[r as Rank]}s`);
const name = (r: number) => RANK_NAME[r as Rank];

/** Plain-English hand name: "Pair of Kings", "Two Pair, Aces and Sevens". */
export function describeHand(rank: HandRank): string {
  const [a, b] = rank.tiebreakers;
  switch (rank.category) {
    case HandCategory.HighCard: return `${name(a)} high`;
    case HandCategory.Pair: return `Pair of ${plural(a)}`;
    case HandCategory.TwoPair: return `Two Pair, ${plural(a)} and ${plural(b)}`;
    case HandCategory.ThreeOfAKind: return `Three ${plural(a)}`;
    case HandCategory.Straight: return `Straight to the ${name(a)}`;
    case HandCategory.Flush: return `${name(a)}-high Flush`;
    case HandCategory.FullHouse: return `Full House, ${plural(a)} full of ${plural(b)}`;
    case HandCategory.FourOfAKind: return `Four ${plural(a)}`;
    case HandCategory.StraightFlush: return a === 14 ? 'Royal Flush' : `Straight Flush to the ${name(a)}`;
  }
}

const SUIT: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardText = (c: Card) => `${c.rank === 10 ? '10' : c.rank > 10 ? name(c.rank)[0] : c.rank}${SUIT[c.suit]}`;
const same = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

/** Which of `hole` made it into the best five. */
function holeCardsUsed(hole: Card[], rank: HandRank): Card[] {
  return hole.filter((h) => rank.cards.some((c) => same(c, h)));
}

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * One useful sentence or two for the coach once a hand is over: why the
 * winner won and which cards played, from the hero's point of view.
 * Null while the hand is live.
 */
export function handSummary(game: GameState): string | null {
  const result = game.result;
  if (!result || game.phase !== 'handComplete') return null;
  const seat = (id: number) => game.seats.find((s) => s.id === id)!;
  const hero = game.seats.find((s) => s.isHuman);
  const label = (id: number) => (seat(id).isHuman ? 'You' : seat(id).name);
  const winners = winnersOf(result);
  if (winners.length === 0) return null;
  const heroWin = winners.find((w) => w.seatId === hero?.id);

  if (result.uncontested) {
    const w = winners[0];
    if (heroWin) return `Everyone folded to you. You won ${w.amount.toLocaleString()} without showing your cards.`;
    if (hero?.status === 'folded') return `You folded, and ${label(w.seatId)} took the pot without a showdown.`;
    return `${label(w.seatId)} won ${w.amount.toLocaleString()}. Everyone else folded.`;
  }

  const shown = new Map(result.shown.map((h) => [h.seatId, h.rank]));
  const mainWinners = result.payouts.filter((p) => p.potIndex === 0).map((p) => p.seatId);
  const top = shown.get(mainWinners[0])!;
  const parts: string[] = [];

  if (mainWinners.length > 1) {
    const boardPlays = top.cards.every((c) => game.board.some((b) => same(b, c)));
    parts.push(`Split pot: ${joinNames(mainWinners.map(label))} each had ${describeHand(top)}.`);
    if (boardPlays) parts.push('The board was the best hand, so nobody’s own cards mattered.');
  } else {
    const w = mainWinners[0];
    // Strongest losing hand in the main pot — the one the winner actually beat.
    const losers = result.shown.filter((h) => h.seatId !== w);
    const best = losers.sort((x, y) => compareHandRank(y.rank, x.rank))[0];
    const heroRank = hero ? shown.get(hero.id) : undefined;

    if (w === hero?.id) {
      parts.push(best
        ? `Your ${describeHand(top)} beat ${label(best.seatId)}’s ${describeHand(best.rank)}.`
        : `You won with ${describeHand(top)}.`);
    } else if (heroRank) {
      parts.push(`${label(w)}’s ${describeHand(top)} beat your ${describeHand(heroRank)}.`);
      if (heroRank.category === top.category) parts.push('Same kind of hand: the higher cards decided it.');
    } else {
      parts.push(best
        ? `${label(w)} won with ${describeHand(top)} against ${label(best.seatId)}’s ${describeHand(best.rank)}.`
        : `${label(w)} won with ${describeHand(top)}.`);
    }

    const used = holeCardsUsed(seat(w).holeCards, top);
    const who = w === hero?.id ? 'your' : `${label(w)}’s`;
    parts.push(used.length === 2
      ? `Both of ${who} cards played.`
      : used.length === 1
        ? `Only one of ${who} cards played: ${cardText(used[0])}.`
        : `${w === hero?.id ? 'Your' : `${label(w)}’s`} cards did not play. The board made the hand.`);
  }

  // Side pots that went to someone other than the main-pot winner(s).
  const sideWinners = [...new Set(result.payouts.filter((p) => p.potIndex > 0).map((p) => p.seatId))]
    .filter((id) => !mainWinners.includes(id));
  if (sideWinners.length > 0) {
    parts.push(`${joinNames(sideWinners.map(label))} won the side pot.`);
  }
  return parts.join(' ');
}
