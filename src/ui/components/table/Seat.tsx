import type { ActionType, Card, Seat as SeatType } from '../../../engine/types';
import { PlayingCard } from './Card';
import { BotFace, botIdFor, type BotId, type Emotion } from './BotFace';
import { useCountUp } from '../../hooks/useCountUp';
import { BOT_DELAY_MS } from '../../store/gameStore';
import type { GazeVec } from '../../hooks/useGazeDirector';
import type { HandTell } from '../../lib/botEmotion';

export interface ActionBubble {
  text: string;
  tone: 'red' | 'blue' | 'orange';
  /** Log index of the action — keying on it replays the pop animation. */
  seq: number;
  /** Raw action type — feeds the bot emotion derivation. */
  type: ActionType;
}

interface SeatProps {
  seat: SeatType;
  isToAct: boolean;
  /** Reveal hole cards (at showdown). */
  revealCards: boolean;
  blindLabel?: 'SB' | 'BB';
  highlightKeys?: Set<string>;
  /** This seat's most recent action on the current street. */
  bubble?: ActionBubble;
  /** Show the animated "thinking" bubble (bot deciding). */
  thinking?: boolean;
  /** Facial state for the BotFace — derived in Table, never stored. */
  emotion: Emotion;
  /** Bump to replay the emotion's entry jolt (keys the .bf-pose remount). */
  emotionSeq: number;
  /** Showdown emote glyph (at most one bot per hand; lifecycle is pure CSS). */
  emote?: string;
  /** Resolved gaze offset for the BotFace (cosmetic; from useGazeDirector). */
  gaze?: GazeVec;
  /** Smug chip-leader modifier. */
  proud?: boolean;
  /** Faint strength tell, only while acting. */
  tell?: HandTell;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

/** Cosmetic fixed bot levels (GG-style ring badges); the hero's comes from learn progress. */
const BOT_LEVEL: Record<BotId, number> = { ava: 8, ben: 4, cleo: 12 };

/** Stack readout that rolls toward its new value — the won pot visibly lands. */
export function StackAmount({ value }: { value: number }) {
  const shown = useCountUp(value, 600);
  return <>{shown.toLocaleString()}</>;
}

/** A bot seat: fanned card backs (or revealed cards), animated face, name plate. */
export function Seat({ seat, isToAct, revealCards, blindLabel, highlightKeys, bubble, thinking, emotion, emotionSeq, emote, gaze, proud, tell }: SeatProps) {
  const folded = seat.status === 'folded';
  const allIn = seat.status === 'allin';
  // Busted: 0 chips at deal → seated 'out' with no hole cards. Render as a dim,
  // card-less "OUT" seat so it doesn't read as an active player (the residual
  // "Ben sits with card-backs but no chips" cosmetic).
  const isOut = seat.status === 'out';
  const showCards = revealCards && seat.holeCards.length === 2;
  const bot = botIdFor(seat.name);

  return (
    <div className={`botseat${isToAct ? ' botseat-acting' : ''}${folded ? ' botseat-folded' : ''}${isOut ? ' botseat-out' : ''}`}>
      <div className="botseat-top">
        <div className="botseat-cards">
          {isOut ? null : showCards ? (
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
        <span className="botseat-avatar-wrap">
          <div className="botseat-avatar">
            <BotFace
                bot={bot}
                emotion={emotion}
                seatId={seat.id}
                name={seat.name}
                emotionSeq={emotionSeq}
                gaze={gaze}
                proud={proud}
                tell={tell}
              />
          </div>
          {/* Timebank: full ring when idle; drains over BOT_DELAY_MS while
              acting, reddening near empty. pathLength=100 → dash math in %. */}
          <svg
            className="acting-ring"
            viewBox="0 0 52 52"
            aria-hidden="true"
            style={{ ['--tb-ms' as string]: `${BOT_DELAY_MS}ms` }}
          >
            <circle className="acting-ring-track" cx="26" cy="26" r="22" />
            <circle className="acting-ring-progress" cx="26" cy="26" r="22" pathLength={100} />
          </svg>
          <span className="seat-level">{BOT_LEVEL[bot]}</span>
          {emote && <span className="seat-emote">{emote}</span>}
        </span>
        {thinking ? (
          <span className="seat-bubble seat-bubble-think" aria-label={`${seat.name} is thinking`}>
            <i /><i /><i />
          </span>
        ) : bubble ? (
          <span key={bubble.seq} className={`seat-bubble seat-bubble-${bubble.tone}`}>{bubble.text}</span>
        ) : null}
        <div className="botseat-plate">
          <span className="botseat-name">{seat.name}</span>
          {blindLabel && <span className="badge badge-blind">{blindLabel}</span>}
          {allIn && <span className="badge badge-allin">ALL-IN</span>}
          {isOut ? (
            <span className="badge badge-out">OUT</span>
          ) : (
            <span className="botseat-stack"><StackAmount value={seat.stack} /></span>
          )}
        </div>
      </div>
    </div>
  );
}
