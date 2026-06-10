import type { GameState } from '../../../engine/types';
import { Seat } from './Seat';
import { Board } from './Board';
import { blindSeats, isShowdown, winningCardKeys } from '../../lib/derive';

interface TableProps {
  game: GameState;
}

export function Table({ game }: TableProps) {
  const { sb, bb } = blindSeats(game);
  const reveal = isShowdown(game);
  const highlight = winningCardKeys(game);
  const pot = game.pots.reduce((sum, p) => sum + p.amount, 0);

  const hero = game.seats.find((s) => s.isHuman);
  const opponents = game.seats.filter((s) => !s.isHuman);

  const seatProps = (id: number) => ({
    isButton: id === game.buttonSeatId,
    isToAct: id === game.toActSeatId,
    revealCards: reveal || (hero?.id === id),
    blindLabel: id === sb ? ('SB' as const) : id === bb ? ('BB' as const) : undefined,
    highlightKeys: highlight,
  });

  return (
    <div className="table">
      <div className="table-opponents">
        {opponents.map((seat) => (
          <Seat key={seat.id} seat={seat} {...seatProps(seat.id)} />
        ))}
      </div>

      <div className="table-felt">
        <Board board={game.board} pot={pot} highlightKeys={highlight} />
      </div>

      {hero && (
        <div className="table-hero">
          <Seat seat={hero} {...seatProps(hero.id)} />
        </div>
      )}
    </div>
  );
}
