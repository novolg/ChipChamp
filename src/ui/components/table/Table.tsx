import type { ReactNode } from 'react';
import type { Card, GameState } from '../../../engine/types';
import { Seat, type ActionBubble } from './Seat';
import { Board } from './Board';
import { PlayingCard } from './Card';
import { blindSeats, isShowdown, winningCardKeys } from '../../lib/derive';

interface TableProps {
  game: GameState;
  /** Seat currently "thinking" (a bot deciding); shows the dots bubble. */
  thinkingSeatId?: number | null;
  /** Extra layers rendered over the table (e.g. the win celebration). */
  children?: ReactNode;
}

const key = (c: Card) => `${c.rank}${c.suit}`;
const POSITIONS = ['left', 'center', 'right'] as const;

const ACTION_LABEL: Record<string, string> = {
  fold: 'FOLD', check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE', allin: 'ALL-IN',
};

/** Each seat's most recent action on the current street, for speech bubbles. */
function actionBubbles(game: GameState): Map<number, ActionBubble> {
  const map = new Map<number, ActionBubble>();
  game.log.forEach((entry, i) => {
    const a = entry.action;
    if (!a || entry.street !== game.street || a.type === 'postBlind') return;
    const amount = a.amount ? ` ${a.amount.toLocaleString()}` : '';
    const tone = a.type === 'fold' ? 'red' : a.type === 'check' || a.type === 'call' ? 'blue' : 'orange';
    map.set(a.seatId, { text: `${ACTION_LABEL[a.type]}${amount}`, tone, seq: i });
  });
  return map;
}

export function Table({ game, thinkingSeatId, children }: TableProps) {
  const { sb, bb } = blindSeats(game);
  const reveal = isShowdown(game);
  const highlight = winningCardKeys(game);
  const pot = game.pots.reduce((sum, p) => sum + p.amount, 0);
  const bubbles = actionBubbles(game);

  const hero = game.seats.find((s) => s.isHuman);
  const opponents = game.seats.filter((s) => !s.isHuman);

  const blindOf = (id: number): 'SB' | 'BB' | undefined =>
    id === sb ? 'SB' : id === bb ? 'BB' : undefined;

  const heroBubble = hero ? bubbles.get(hero.id) : undefined;

  return (
    <div className="table">
      <div className="table-cone" aria-hidden="true" />

      <div className="table-felt">
        <div className="table-felt-noise" aria-hidden="true" />
        <Board board={game.board} pot={pot} street={game.street} highlightKeys={highlight} />
      </div>

      {opponents.slice(0, 3).map((seat, i) => (
        /* Keyed per hand so the deal-in animation replays on every new hand. */
        <div key={`${seat.id}-${game.handNumber}`} className={`seat-slot seat-slot-${POSITIONS[i]}`}>
          <Seat
            seat={seat}
            isButton={seat.id === game.buttonSeatId}
            isToAct={seat.id === game.toActSeatId && game.phase === 'betting'}
            revealCards={reveal}
            blindLabel={blindOf(seat.id)}
            highlightKeys={highlight}
            bubble={bubbles.get(seat.id)}
            thinking={thinkingSeatId === seat.id}
          />
        </div>
      ))}

      {hero && (
        <div className="hero">
          <div className="hero-cards" key={game.handNumber}>
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
            {heroBubble && (
              <span key={heroBubble.seq} className={`seat-bubble seat-bubble-${heroBubble.tone} hero-bubble`}>
                {heroBubble.text}
              </span>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
