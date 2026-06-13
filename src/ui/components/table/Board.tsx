import type { Card } from '../../../engine/types';
import { PlayingCard } from './Card';
import { useCountUp } from '../../hooks/useCountUp';

interface BoardProps {
  board: Card[];
  pot: number;
  street: string;
  highlightKeys?: Set<string>;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

/** Centre of the felt: street pill, pot, community cards (or dashed slots), deck. */
export function Board({ board, pot, street, highlightKeys }: BoardProps) {
  const shownPot = useCountUp(pot);
  return (
    <>
      <img src="/assets/logo-wordmark.png" alt="" className="felt-watermark" aria-hidden="true" />
      <img src="/assets/card-back.png" alt="" className="felt-deck" aria-hidden="true" />
      <div className="felt-stack">
        <div className="felt-street" key={street}>{street.toUpperCase()}</div>
        <div className={`felt-pot${pot > 0 ? ' felt-pot-live' : ''}`}>
          <span className="felt-pot-chips" key={pot} aria-hidden="true">
            <img src="/assets/chip-orange.png" alt="" className="felt-pot-chip felt-pot-chip-0" />
            <img src="/assets/chip-blue.png" alt="" className="felt-pot-chip felt-pot-chip-1" />
          </span>
          <span className="felt-pot-label">TOTAL POT</span>
          <span className="felt-pot-amount">{shownPot.toLocaleString()}</span>
        </div>
        <div className="felt-cards">
          {[0, 1, 2, 3, 4].map((i) => {
            const card = board[i];
            return card ? (
              <PlayingCard
                key={i}
                card={card}
                size="board"
                highlight={highlightKeys?.has(key(card))}
                dealDelay={i <= 2 ? i * 0.09 : 0}
              />
            ) : (
              <div key={i} className="felt-slot" />
            );
          })}
        </div>
      </div>
    </>
  );
}
