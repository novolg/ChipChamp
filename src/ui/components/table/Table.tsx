import type { Card, GameState } from '../../../engine/types';
import { Seat } from './Seat';
import { Board } from './Board';
import { PlayingCard } from './Card';
import { blindSeats, isShowdown, winningCardKeys } from '../../lib/derive';

interface TableProps {
  game: GameState;
}

const key = (c: Card) => `${c.rank}${c.suit}`;
const POSITIONS = ['left', 'center', 'right'] as const;

export function Table({ game }: TableProps) {
  const { sb, bb } = blindSeats(game);
  const reveal = isShowdown(game);
  const highlight = winningCardKeys(game);
  const pot = game.pots.reduce((sum, p) => sum + p.amount, 0);

  const hero = game.seats.find((s) => s.isHuman);
  const opponents = game.seats.filter((s) => !s.isHuman);

  const blindOf = (id: number): 'SB' | 'BB' | undefined =>
    id === sb ? 'SB' : id === bb ? 'BB' : undefined;

  return (
    <div className="table">
      <div className="table-cone" aria-hidden="true" />

      <div className="table-felt">
        <div className="table-felt-noise" aria-hidden="true" />
        <Board board={game.board} pot={pot} street={game.street} highlightKeys={highlight} />
      </div>

      {opponents.slice(0, 3).map((seat, i) => (
        <div key={seat.id} className={`seat-slot seat-slot-${POSITIONS[i]}`}>
          <Seat
            seat={seat}
            isButton={seat.id === game.buttonSeatId}
            isToAct={seat.id === game.toActSeatId && game.phase === 'betting'}
            revealCards={reveal}
            blindLabel={blindOf(seat.id)}
            highlightKeys={highlight}
          />
        </div>
      ))}

      {hero && (
        <div className="hero">
          <div className="hero-cards">
            {hero.holeCards.length === 2 ? (
              hero.holeCards.map((c, i) => (
                <PlayingCard key={i} card={c} size="hero" highlight={highlight.has(key(c))} />
              ))
            ) : (
              <>
                <div className="pcard pcard-hero pcard-empty" />
                <div className="pcard pcard-hero pcard-empty" />
              </>
            )}
          </div>
          <div className="hero-plate">
            <span className="hero-you">YOU</span>
            {hero.id === game.buttonSeatId && <span className="hero-dealer">D</span>}
            {blindOf(hero.id) && <span className="badge badge-blind">{blindOf(hero.id)}</span>}
            <span className="hero-stack">{hero.stack.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
