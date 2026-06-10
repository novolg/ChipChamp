import type { Card as CardType, Suit } from '../../../engine/types';
import { rankLabel } from '../../../engine/evaluator';

const SUIT_SYMBOL: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
const RED: Suit[] = ['d', 'h'];

interface CardProps {
  card?: CardType;
  /** Render face-down (opponent hole cards before showdown). */
  faceDown?: boolean;
  /** Highlight as part of the winning hand. */
  highlight?: boolean;
  size?: 'sm' | 'md';
}

export function PlayingCard({ card, faceDown, highlight, size = 'md' }: CardProps) {
  if (faceDown || !card) {
    return <div className={`card card-back card-${size}`} aria-label="face-down card" />;
  }
  const red = RED.includes(card.suit);
  return (
    <div
      className={`card card-${size} ${red ? 'card-red' : 'card-black'} ${highlight ? 'card-highlight' : ''}`}
      aria-label={`${rankLabel(card.rank)} of ${card.suit}`}
    >
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}
