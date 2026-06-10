import type { Card } from '../../../engine/types';
import { PlayingCard } from './Card';

interface BoardProps {
  board: Card[];
  pot: number;
  highlightKeys?: Set<string>;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

/** Community cards and the pot in the centre of the table. */
export function Board({ board, pot, highlightKeys }: BoardProps) {
  return (
    <div className="board">
      <div className="board-cards">
        {[0, 1, 2, 3, 4].map((i) => {
          const card = board[i];
          return card ? (
            <PlayingCard key={i} card={card} highlight={highlightKeys?.has(key(card))} />
          ) : (
            <div key={i} className="card card-slot" />
          );
        })}
      </div>
      <div className="board-pot">Pot {pot.toLocaleString()}</div>
    </div>
  );
}
