import type { Card } from '../../../engine/types';
import { PlayingCard } from './Card';

interface BoardProps {
  board: Card[];
  pot: number;
  street: string;
  highlightKeys?: Set<string>;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

/** Centre of the felt: street pill, pot, community cards (or dashed slots), deck. */
export function Board({ board, pot, street, highlightKeys }: BoardProps) {
  return (
    <>
      <img src="/assets/card-back.png" alt="" className="felt-deck" aria-hidden="true" />
      <div className="felt-stack">
        <div className="felt-street">{street.toUpperCase()}</div>
        <div className="felt-pot">
          <span className="felt-pot-chips" aria-hidden="true">
            <img src="/assets/chip-orange.png" alt="" className="felt-pot-chip felt-pot-chip-0" />
            <img src="/assets/chip-blue.png" alt="" className="felt-pot-chip felt-pot-chip-1" />
          </span>
          <span className="felt-pot-amount">POT {pot.toLocaleString()}</span>
        </div>
        <div className="felt-cards">
          {[0, 1, 2, 3, 4].map((i) => {
            const card = board[i];
            return card ? (
              <PlayingCard key={i} card={card} size="board" highlight={highlightKeys?.has(key(card))} />
            ) : (
              <div key={i} className="felt-slot" />
            );
          })}
        </div>
      </div>
    </>
  );
}
