import type { Card as CardType, Suit } from '../../../engine/types';
import { rankLabel } from '../../../engine/evaluator';

const SUIT_SYMBOL: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
const RED: Suit[] = ['d', 'h'];

interface CardProps {
  card?: CardType;
  /** Render face-down (opponent hole cards before showdown) using the card back. */
  faceDown?: boolean;
  /** Highlight as part of the winning hand. */
  highlight?: boolean;
  /** hero = 92×128 fanned hole cards; board = 56×78 community; sm/md for tutorials. */
  size?: 'sm' | 'md' | 'board' | 'hero';
}

export function PlayingCard({ card, faceDown, highlight, size = 'md' }: CardProps) {
  if (faceDown || !card) {
    return (
      <div className={`pcard pcard-${size} pcard-back`} aria-label="face-down card">
        <img src="/assets/card-back.png" alt="" />
      </div>
    );
  }
  const red = RED.includes(card.suit);
  return (
    <div
      className={`pcard pcard-${size} ${red ? 'pcard-red' : 'pcard-ink'} ${highlight ? 'pcard-highlight' : ''}`}
      aria-label={`${rankLabel(card.rank)} of ${card.suit}`}
    >
      <span className="pcard-rank">{rankLabel(card.rank)}</span>
      <span className="pcard-suit">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}
