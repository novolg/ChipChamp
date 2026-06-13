import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, GameState, Seat as SeatState } from '../../../engine/types';
import { Seat, StackAmount, type ActionBubble } from './Seat';
import { Board } from './Board';
import { PlayingCard } from './Card';
import { Chips } from './Chips';
import { botIdFor, type BotId } from './BotFace';
import { blindSeats, isShowdown, winnerNames, winningCardKeys } from '../../lib/derive';
import { deriveEmotion, type Emotion } from '../../lib/botEmotion';
import { useProgressStore } from '../../store/progressStore';
import { LEARNING_PATH } from '../../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../../tutorial/content/quizzes';
import { isStepComplete } from '../../../tutorial/progress/progressReducer';

interface TableProps {
  game: GameState;
  /** Seat currently "thinking" (a bot deciding); shows the dots bubble. */
  thinkingSeatId?: number | null;
  /** Extra layers rendered over the table (e.g. the win celebration). */
  children?: ReactNode;
}

const key = (c: Card) => `${c.rank}${c.suit}`;
const POSITIONS = ['left', 'center', 'right'] as const;

/** Felt coordinates for the dealer disc, one per button slot (852x600 table area). */
const DEALER_XY = {
  left: { x: 212, y: 196 },
  center: { x: 516, y: 152 },
  right: { x: 640, y: 196 },
  hero: { x: 544, y: 430 },
} as const;

const ACTION_LABEL: Record<string, string> = {
  fold: 'FOLD', check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE', allin: 'ALL-IN',
};

const EMPTY_WINNERS = new Set<string>();

/* Showdown emotes are rare on purpose: big pots only, at most ONE bot per hand. */
const EMOTE_MIN_POT_BB = 12; // a bot gloats over its own win
const EMOTE_MIN_HERO_POT_BB = 20; // a bot grudges a big hero win
const EMOTE_SETS: Record<BotId, { win: string[]; grudge: string[] }> = {
  ava: { win: ['🎉', '😄', '💪'], grudge: ['😅'] },
  ben: { win: ['👍', '🙂'], grudge: ['😐'] },
  cleo: { win: ['😏', '😼'], grudge: ['🙄'] },
};

/** Which bot (if any) shows an emote bubble this hand, and which glyph.
 *  Deterministic: glyph choice keys off handNumber + seat id, no RNG. */
function emoteFor(
  game: GameState,
  winners: Set<string>,
  opponents: SeatState[],
  pot: number,
): { seatId: number; glyph: string } | null {
  if (game.phase !== 'handComplete') return null;
  const glyph = (seat: SeatState, set: string[]) => set[(game.handNumber + seat.id) % set.length];
  const botWinners = opponents.filter((s) => winners.has(s.name));
  if (botWinners.length > 0 && pot >= EMOTE_MIN_POT_BB * game.bigBlind) {
    const seat = botWinners.reduce((a, b) => (b.id < a.id ? b : a)); // lowest id on splits
    return { seatId: seat.id, glyph: glyph(seat, EMOTE_SETS[botIdFor(seat.name)].win) };
  }
  if (winners.has('You') && pot >= EMOTE_MIN_HERO_POT_BB * game.bigBlind) {
    // Exclude folded seats: a sleeping bot shouldn't react to a showdown it
    // wasn't in. The length guard then also covers the all-folded case.
    const losers = opponents.filter((s) => !winners.has(s.name) && s.status !== 'folded');
    if (losers.length === 0) return null;
    const seat = losers.reduce((a, b) => (b.committedTotal > a.committedTotal ? b : a));
    return { seatId: seat.id, glyph: glyph(seat, EMOTE_SETS[botIdFor(seat.name)].grudge) };
  }
  return null;
}

/** Each seat's most recent action on the current street, for speech bubbles. */
function actionBubbles(game: GameState): Map<number, ActionBubble> {
  const map = new Map<number, ActionBubble>();
  game.log.forEach((entry, i) => {
    const a = entry.action;
    if (!a || entry.street !== game.street || a.type === 'postBlind') return;
    const amount = a.amount ? ` ${a.amount.toLocaleString()}` : '';
    const tone = a.type === 'fold' ? 'red' : a.type === 'check' || a.type === 'call' ? 'blue' : 'orange';
    map.set(a.seatId, { text: `${ACTION_LABEL[a.type]}${amount}`, tone, seq: i, type: a.type });
  });
  return map;
}

/** Seq that keys BotFace's one-shot entry jolt. Confident replays per action
 *  (bubble seq); shocked has two sources — a seat that is itself all-in holds a
 *  STABLE seq so the jolt fires once and then holds the wide-eyed pose, while a
 *  seat reacting to someone ELSE's shove re-fires as each new shove lands. */
function emotionSeqFor(
  emotion: Emotion,
  seat: SeatState,
  bubble: ActionBubble | undefined,
  game: GameState,
): number {
  if (emotion === 'confident') return bubble?.seq ?? 0;
  if (emotion === 'shocked') return seat.status === 'allin' ? 0 : game.log.length;
  return 0;
}

export function Table({ game, thinkingSeatId, children }: TableProps) {
  const { sb, bb } = blindSeats(game);
  const reveal = isShowdown(game);
  const highlight = winningCardKeys(game);
  const pot = game.pots.reduce((sum, p) => sum + p.amount, 0);
  const bubbles = actionBubbles(game);

  const hero = game.seats.find((s) => s.isHuman);
  const opponents = game.seats.filter((s) => !s.isHuman);

  const winners = game.phase === 'handComplete' ? winnerNames(game) : EMPTY_WINNERS;
  const emote = emoteFor(game, winners, opponents, pot);

  // Hero's level badge surfaces learn progress AT the poker table (p11).
  const done = useProgressStore(
    (s) => LEARNING_PATH.filter((step) => isStepComplete(step, s.progress, QUIZZES_BY_ID)).length,
  );

  // The dealer disc persists across hands (NOT keyed), so changing its inline
  // transform glides it to the next button seat with a small overshoot.
  const dealerSlot =
    hero && hero.id === game.buttonSeatId
      ? 'hero'
      : POSITIONS[opponents.findIndex((s) => s.id === game.buttonSeatId)];
  const dealerXY = DEALER_XY[dealerSlot];

  // Street-end collect sweep: when the street flips, ghost-render the previous
  // street's bet pills sweeping into the pot. committedRef is refreshed by the
  // dep-less effect BELOW this one, so at the moment the street changes this
  // effect still reads the PRE-reset amounts (effects run in declaration order).
  const prevStreet = useRef(game.street);
  const committedRef = useRef<Record<string, number>>({});
  const [ghosts, setGhosts] = useState<{ pos: string; amount: number }[]>([]);
  useEffect(() => {
    if (prevStreet.current === game.street) return;
    const g = Object.entries(committedRef.current)
      .filter(([, a]) => a > 0)
      .map(([pos, amount]) => ({ pos, amount }));
    prevStreet.current = game.street;
    if (g.length) {
      setGhosts(g);
      const t = setTimeout(() => setGhosts([]), 500);
      return () => clearTimeout(t);
    }
  }, [game.street]);
  useEffect(() => {
    const m: Record<string, number> = {};
    if (game.phase === 'betting') {
      // Mirror the render gate: the engine leaves committedThisStreet stale at
      // hand end, and a stale snapshot would replay the sweep on the next deal.
      opponents.slice(0, 3).forEach((s, i) => { m[POSITIONS[i]] = s.committedThisStreet; });
      if (hero) m.hero = hero.committedThisStreet;
    }
    committedRef.current = m;
  });

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

      <span
        className="dealer-disc"
        style={{ transform: `translate(${dealerXY.x}px, ${dealerXY.y}px)` }}
        aria-label="dealer button"
      >
        D
      </span>

      {opponents.slice(0, 3).map((seat, i) => {
        const bubble = bubbles.get(seat.id);
        const emotion = deriveEmotion(seat, game, thinkingSeatId === seat.id, winners, bubble?.type);
        return (
          /* Keyed per hand so the deal-in animation replays on every new hand. */
          <div key={`${seat.id}-${game.handNumber}`} className={`seat-slot seat-slot-${POSITIONS[i]}`}>
            <Seat
              seat={seat}
              isToAct={seat.id === game.toActSeatId && game.phase === 'betting'}
              revealCards={reveal}
              blindLabel={blindOf(seat.id)}
              highlightKeys={highlight}
              bubble={bubble}
              thinking={thinkingSeatId === seat.id}
              emotion={emotion}
              emotionSeq={emotionSeqFor(emotion, seat, bubble, game)}
              emote={emote && emote.seatId === seat.id ? emote.glyph : undefined}
            />
          </div>
        );
      })}

      {/* Bet pills sit ON the felt between seat and pot, GG-style. Gated on
          the betting phase: the engine doesn't reset committedThisStreet at
          hand end, and the ghosts below take over for the rake-in moment. */}
      {game.phase === 'betting' &&
        opponents.slice(0, 3).map((s, i) =>
          s.committedThisStreet > 0 ? (
            <div key={s.id} className={`seat-bet seat-bet-${POSITIONS[i]}`}>
              <Chips amount={s.committedThisStreet} tone={s.id === game.toActSeatId ? 'orange' : 'blue'} />
            </div>
          ) : null,
        )}
      {game.phase === 'betting' && hero && hero.committedThisStreet > 0 && (
        <div className="seat-bet seat-bet-hero">
          <Chips amount={hero.committedThisStreet} tone="blue" />
        </div>
      )}
      {/* Last street's pills sweeping into the pot. */}
      {ghosts.map((g) => (
        <div key={g.pos} className={`seat-bet seat-bet-${g.pos} seat-bet-collect`}>
          <Chips amount={g.amount} tone="blue" />
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
            <span className="seat-level seat-level-hero" key={done}>{done + 1}</span>
            <span className="hero-you">YOU</span>
            {blindOf(hero.id) && <span className="badge badge-blind">{blindOf(hero.id)}</span>}
            <span className="hero-stack"><StackAmount value={hero.stack} /></span>
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
