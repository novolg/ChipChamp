import type { Card, Seat as SeatType } from '../../../engine/types';
import { PlayingCard } from './Card';
import { Chips } from './Chips';

interface SeatProps {
  seat: SeatType;
  isButton: boolean;
  isToAct: boolean;
  /** Reveal hole cards (hero always; opponents at showdown). */
  revealCards: boolean;
  blindLabel?: 'SB' | 'BB';
  highlightKeys?: Set<string>;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

export function Seat({ seat, isButton, isToAct, revealCards, blindLabel, highlightKeys }: SeatProps) {
  const folded = seat.status === 'folded';
  const allIn = seat.status === 'allin';

  return (
    <div className={`seat ${isToAct ? 'seat-active' : ''} ${folded ? 'seat-folded' : ''}`}>
      <div className="seat-cards">
        {seat.holeCards.length === 0
          ? <PlayingCard faceDown size="sm" />
          : seat.holeCards.map((c, i) => (
              <PlayingCard
                key={i}
                card={c}
                faceDown={!revealCards && !seat.isHuman}
                highlight={revealCards && highlightKeys?.has(key(c))}
                size="sm"
              />
            ))}
      </div>

      <div className="seat-info">
        <div className="seat-name">
          {seat.name}
          {isButton && <span className="badge badge-button" title="Dealer button">D</span>}
          {blindLabel && <span className="badge badge-blind">{blindLabel}</span>}
        </div>
        <div className="seat-stack">{seat.stack.toLocaleString()}</div>
        {folded && <div className="seat-status">Folded</div>}
        {allIn && <div className="seat-status seat-status-allin">All-in</div>}
      </div>

      <Chips amount={seat.committedThisStreet} label="Committed this street" />
    </div>
  );
}
