import type { Card, Seat as SeatType } from '../../../engine/types';
import { PlayingCard } from './Card';
import { Chips } from './Chips';

interface SeatProps {
  seat: SeatType;
  isButton: boolean;
  isToAct: boolean;
  /** Reveal hole cards (at showdown). */
  revealCards: boolean;
  blindLabel?: 'SB' | 'BB';
  highlightKeys?: Set<string>;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

/** Map a bot's name to its avatar art; fall back to Ben's. */
function avatarFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('ava')) return '/assets/bot-ava.png';
  if (n.includes('cleo')) return '/assets/bot-cleo.png';
  return '/assets/bot-ben.png';
}

/** A bot seat: fanned card backs (or revealed cards), avatar, name plate and bet pill. */
export function Seat({ seat, isButton, isToAct, revealCards, blindLabel, highlightKeys }: SeatProps) {
  const folded = seat.status === 'folded';
  const allIn = seat.status === 'allin';
  const showCards = revealCards && seat.holeCards.length === 2;

  return (
    <div className={`botseat${isToAct ? ' botseat-acting' : ''}${folded ? ' botseat-folded' : ''}`}>
      <div className="botseat-top">
        <div className="botseat-cards">
          {showCards ? (
            seat.holeCards.map((c, i) => (
              <PlayingCard
                key={i}
                card={c}
                size="sm"
                highlight={highlightKeys?.has(key(c))}
              />
            ))
          ) : (
            <>
              <img src="/assets/card-back.png" alt="" className="botseat-back botseat-back-l" />
              <img src="/assets/card-back.png" alt="" className="botseat-back botseat-back-r" />
            </>
          )}
        </div>
        <img src={avatarFor(seat.name)} alt="" className="botseat-avatar" />
        <div className="botseat-plate">
          <span className="botseat-name">{seat.name}</span>
          {isButton && <span className="badge badge-button" title="Dealer">D</span>}
          {blindLabel && <span className="badge badge-blind">{blindLabel}</span>}
          {isToAct && <span className="badge badge-acting">ACTING</span>}
          {allIn && <span className="badge badge-allin">ALL-IN</span>}
          <span className="botseat-stack">{seat.stack.toLocaleString()}</span>
        </div>
      </div>
      <Chips amount={seat.committedThisStreet} tone={isToAct ? 'orange' : 'blue'} label="Bet" />
    </div>
  );
}
