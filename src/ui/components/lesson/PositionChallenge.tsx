import { useEffect, useRef, useState } from 'react';
import { POSITION_SPOTS, openingActionOrder, positionLabel, positionName } from '../../../tutorial/positions';
import { useSettingsStore, prefersReducedMotion } from '../../store/settingsStore';
import { playSfx } from '../../lib/sound';
import './positionChallenge.css';

export function PositionChallenge({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  const reduced = prefersReducedMotion(useSettingsStore((s) => s.settings));
  useEffect(() => { if (previous.current !== step || done) heading.current?.focus(); previous.current = step; }, [step, done]);
  const spot = POSITION_SPOTS[step];
  const order = openingActionOrder(spot.players, spot.street, spot.folded);
  const last = order[order.length - 1];
  const correct = answer === last;
  const choose = (seat: number) => { setAnswer(seat); playSfx(seat === last ? 'win' : 'incorrect'); };
  const next = () => {
    if (step === POSITION_SPOTS.length - 1) { setDone(true); onComplete(); playSfx('levelUp'); }
    else { setStep((s) => s + 1); setAnswer(null); setRevealed(0); setHint(false); playSfx('click'); }
  };
  return <section className="position-challenge" data-reduced={reduced} aria-labelledby="position-challenge-title">
    <div className="position-challenge-top"><span>READ THE TABLE</span><span>{done ? 'COMPLETE' : `SPOT ${step + 1} OF ${POSITION_SPOTS.length}`}</span></div>
    <h3 id="position-challenge-title" ref={heading} tabIndex={-1}>{done ? 'You know where the information is.' : spot.title}</h3>
    {done ? <div role="status"><p>Before the flop, after the flop, with folded seats and heads-up: you found who gets to decide last.</p><p>Finish this lesson, then bring that awareness into your next practice hand.</p></div> : <>
      <p>Who acts last on the <strong>first pass</strong> of this betting round? Tap an active seat.</p>
      <div className={`position-table position-table-${spot.players}`} role="group" aria-label="Choose the last player to act">
        <div className="position-table-center"><strong>{spot.street === 'preflop' ? 'PREFLOP' : 'FLOP'}</strong><span>{spot.players} players seated</span><small>Action moves clockwise</small></div>
        {Array.from({ length: spot.players }, (_, seat) => {
          const folded = spot.folded.includes(seat);
          const ordinal = order.indexOf(seat);
          const shown = correct || ordinal >= 0 && ordinal < revealed;
          return <button key={seat} className={`position-seat position-seat-${seat}${folded ? ' is-folded' : ''}${answer === seat ? correct ? ' is-right' : ' is-wrong' : ''}${shown ? ' is-revealed' : ''}`}
            disabled={folded || correct} aria-pressed={answer === seat} aria-label={`${positionName(seat, spot.players)}${folded ? ', folded' : ''}`} onClick={() => choose(seat)}>
            {seat === 0 && <i aria-hidden="true">D</i>}<strong>{positionLabel(seat, spot.players)}</strong><small>{folded ? 'FOLDED' : shown ? `ACTS ${ordinal + 1}${ordinal === 0 ? 'ST' : ordinal === 1 ? 'ND' : ordinal === 2 ? 'RD' : 'TH'}` : 'CHOOSE'}</small>
          </button>;
        })}
      </div>
      <div className="position-walkthrough"><button className="btn btn-dark" disabled={correct || revealed >= order.length - 1} onClick={() => { setRevealed((n) => n + 1); playSfx('chipTick'); }}>REVEAL NEXT ACTOR</button><span aria-live="polite">{revealed ? `${positionName(order[revealed - 1], spot.players)} acts ${revealed === 1 ? 'first' : `next (${revealed} of ${order.length})`}.` : 'Need to see the order? Walk through it one seat at a time.'}</span></div>
      {answer !== null && <div className={`position-feedback${correct ? ' is-right' : ''}`} role="status"><strong>{correct ? 'Exactly. You get to see more before deciding.' : 'Not that seat. Follow the action clockwise.'}</strong><p>{correct ? spot.explanation : spot.hint}</p></div>}
      {correct && <div className="position-order" aria-label="Full initial action order">{order.map((seat, i) => <span key={seat}>{i + 1}. {positionLabel(seat, spot.players)}</span>)}</div>}
      <div className="position-actions">{correct ? <button className="btn btn-orange" onClick={next}>{step === POSITION_SPOTS.length - 1 ? 'FINISH THE EXERCISE' : 'NEXT SPOT'} →</button> : <button className="position-hint-button" aria-expanded={hint} onClick={() => setHint((h) => !h)}>{hint ? 'Hide hint' : 'Give me a hint'}</button>}</div>
      {hint && !correct && <p className="position-hint">{spot.hint}</p>}
    </>}
  </section>;
}
