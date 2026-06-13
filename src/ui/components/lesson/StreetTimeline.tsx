import { useState } from 'react';
import type { Card } from '../../../engine/types';
import { PlayingCard } from '../table/Card';
import { playSfx } from '../../lib/sound';

const c = (rank: number, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

const HERO: Card[] = [c(14, 'h'), c(13, 'h')];
const BOARD: Card[] = [c(12, 'h'), c(11, 'h'), c(7, 'c'), c(2, 'd'), c(10, 'h')];
const WINNING = new Set(['14h', '13h', '12h', '11h', '10h']);

const STEPS = [
  {
    label: 'PREFLOP',
    boardCount: 0,
    text: 'You are dealt two private hole cards — here A♥ K♥. The first round of betting happens before any shared cards appear.',
  },
  {
    label: 'FLOP',
    boardCount: 3,
    text: 'Three community cards land in the middle. Everyone shares them. Q♥ and J♥ give you a draw to something huge.',
  },
  {
    label: 'TURN',
    boardCount: 4,
    text: 'A fourth card arrives. The 2♦ changes nothing here — but each new card brings another round of betting.',
  },
  {
    label: 'RIVER',
    boardCount: 5,
    text: 'The fifth and final community card. The 10♥ completes your hand. One last round of betting.',
  },
  {
    label: 'SHOWDOWN',
    boardCount: 5,
    highlight: true,
    text: 'Best five cards win. Your A♥ K♥ combine with Q♥ J♥ 10♥ on the board — a royal flush, the best hand in poker.',
  },
];

/** Interactive walk-through of one hand: click through the streets and watch
 *  the board fill in, ending with the winning five cards highlighted. */
export function StreetTimeline() {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const key = (card: Card) => `${card.rank}${card.suit}`;
  const lit = (card: Card) => Boolean(s.highlight && WINNING.has(key(card)));

  // Advancing a street deals cards onto the felt; stepping back is a soft click.
  const goStep = (i: number) => {
    if (i === step) return;
    playSfx(i > step ? 'cardDeal' : 'click');
    setStep(i);
  };

  return (
    <div className="timeline">
      <div className="timeline-pills" role="tablist" aria-label="betting rounds">
        {STEPS.map((st, i) => (
          <button
            key={st.label}
            role="tab"
            aria-selected={i === step}
            className={`timeline-pill${i === step ? ' timeline-pill-active' : ''}${i < step ? ' timeline-pill-done' : ''}`}
            onClick={() => goStep(i)}
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className="timeline-felt">
        <div className="timeline-board">
          {BOARD.map((card, i) =>
            i < s.boardCount ? (
              <PlayingCard key={key(card)} card={card} size="md" highlight={lit(card)} />
            ) : (
              <div key={`slot-${i}`} className="felt-slot" />
            ),
          )}
        </div>
        <div className="timeline-hero">
          <span className="timeline-hero-label">YOUR CARDS</span>
          <div className="timeline-hero-cards">
            {HERO.map((card) => (
              <PlayingCard key={key(card)} card={card} size="md" highlight={lit(card)} />
            ))}
          </div>
        </div>
      </div>

      <p className="timeline-text" key={step}>{s.text}</p>

      <div className="timeline-nav">
        <button className="btn btn-dark timeline-btn" disabled={step === 0} onClick={() => goStep(step - 1)}>
          ← BACK
        </button>
        <button
          className="btn btn-blue timeline-btn"
          disabled={step === STEPS.length - 1}
          onClick={() => goStep(step + 1)}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}
