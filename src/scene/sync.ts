// Settle-to-truth for the scene's cards: given the authoritative GameState,
// hard-set every card actor (board / hero / bot) to the state it should rest
// in. The Pixi scene calls this whenever its animation timeline is idle, so a
// mount, a nav return, a reduced-motion session, or a skipped animation all
// land on the correct picture. The fx cues (deal / flip / …) are the animated
// path to these same rest states.
//
// Card positions + sizes are derived here from layout.ts so both settle AND
// the deal animations (PokerScene.fx) place cards on identical coordinates.

import type { GameState } from '../engine/types';
import { isShowdown, winningCardKeys } from '../ui/lib/derive';
import { BOT_SLOTS, type Pt, type SeatSlot, type TableLayout } from './layout';
import type { SceneAssets } from './assets';
import type { CardActor } from './actors/CardActor';

/** A card resting placement: world point + fan rotation (radians). */
export interface CardPlacement {
  pt: Pt;
  rot: number;
}

/** The scene's card actors, grouped by role. Fixed-size pools (no per-hand
 *  churn): 5 board, 2 hero, 2 per bot slot. */
export interface SceneCards {
  board: CardActor[]; // up to 5, dealt left→right
  hero: CardActor[]; // 2
  bots: Record<'left' | 'center' | 'right', CardActor[]>; // 2 each
}

const BOT_CARD_SCALE = 0.7; // ≈ the DOM .pcard-sm bot backs vs board cards

export function boardCardSize(L: TableLayout): { w: number; h: number } {
  return { w: L.cardW, h: L.cardH };
}
export function heroCardSize(L: TableLayout): { w: number; h: number } {
  return { w: L.heroCardW, h: L.heroCardH };
}
export function botCardSize(L: TableLayout): { w: number; h: number } {
  return { w: L.cardW * BOT_CARD_SCALE, h: L.cardH * BOT_CARD_SCALE };
}

/** `count` board-card centers, the whole row centered on `L.board` (matches the
 *  DOM overlay's flex row, which re-centers as each street lands). */
export function boardSlotPositions(L: TableLayout, count: number): Pt[] {
  if (count <= 0) return [];
  const step = L.cardW + L.boardGap;
  const startX = L.board.x - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * step, y: L.board.y }));
}

/** The two hero hole-card centers, flat, fanned apart around `seatCards.hero`. */
export function heroCardPositions(L: TableLayout): Pt[] {
  const dx = L.heroCardW * 0.5;
  const { x, y } = L.seatCards.hero;
  return [
    { x: x - dx, y },
    { x: x + dx, y },
  ];
}

/** The two bot hole-card placements for a slot: overlapping fanned backs
 *  (±8°, echoing the DOM .botseat-back-l/-r rotation). */
export function botCardPositions(L: TableLayout, slot: SeatSlot): CardPlacement[] {
  const { x, y } = L.seatCards[slot];
  const dx = botCardSize(L).w * 0.34;
  return [
    { pt: { x: x - dx, y }, rot: -0.14 },
    { pt: { x: x + dx, y }, rot: 0.14 },
  ];
}

const cardKey = (rank: number, suit: string): string => `${rank}${suit}`;

/**
 * Hard-set every card to match `game`. Board + hero are always face-up; bot
 * cards are backs while live, mucked away when folded, hidden when the seat is
 * out, and revealed (winners highlighted, losers dimmed) at showdown.
 */
export function settleCards(
  cards: SceneCards,
  game: GameState,
  assets: SceneAssets,
  fourColor: boolean,
  L: TableLayout,
): void {
  // Board — present cards face-up on the count-centered row; the rest hidden.
  const boardPos = boardSlotPositions(L, game.board.length);
  cards.board.forEach((card, i) => {
    if (i < game.board.length) {
      card.setFace(assets.cardFace(game.board[i], fourColor));
      card.place(boardPos[i], true);
    } else {
      card.hide();
    }
  });

  // Hero — its two hole cards, face-up (or nothing before the deal / when out).
  const hero = game.seats.find((s) => s.isHuman);
  const heroPos = heroCardPositions(L);
  cards.hero.forEach((card, i) => {
    if (hero && hero.holeCards.length === 2) {
      card.setFace(assets.cardFace(hero.holeCards[i], fourColor));
      card.place(heroPos[i], true);
    } else {
      card.hide();
    }
  });

  // Bots.
  const reveal = isShowdown(game);
  const winners = winningCardKeys(game);
  const botSeats = game.seats.filter((s) => !s.isHuman);
  BOT_SLOTS.forEach((slot, idx) => {
    const seat = botSeats[idx];
    const slotCards = cards.bots[slot];
    if (!seat || seat.status === 'out') {
      slotCards.forEach((c) => c.hide());
      return;
    }
    if (seat.status === 'folded') {
      slotCards.forEach((c) => c.muck(L.deck));
      return;
    }
    const placements = botCardPositions(L, slot);
    slotCards.forEach((card, i) => {
      if (reveal && seat.holeCards.length === 2) {
        const c = seat.holeCards[i];
        card.setFace(assets.cardFace(c, fourColor));
        card.place(placements[i].pt, true);
        if (winners.size > 0) {
          const isWinner = winners.has(cardKey(c.rank, c.suit));
          card.highlight(isWinner);
          card.dim(!isWinner);
        } else {
          card.highlight(false);
          card.dim(false);
        }
      } else {
        card.highlight(false);
        card.dim(false);
        card.place(placements[i].pt, false, placements[i].rot);
      }
    });
  });
}
