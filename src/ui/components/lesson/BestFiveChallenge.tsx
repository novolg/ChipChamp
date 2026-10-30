import { useEffect, useRef, useState } from 'react';
import { BEST_FIVE_EXERCISES, assessBestFive, type BestFiveExercise } from '../../../tutorial/bestFive';
import { HAND_CATEGORY_LABEL, rankLabel } from '../../../engine/evaluator';
import { PlayingCard } from '../table/Card';
import { playSfx } from '../../lib/sound';
import { useSettingsStore, prefersReducedMotion } from '../../store/settingsStore';
import './bestFive.css';

const SUITS = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

export function BestFiveChallenge({ onComplete, exercises = BEST_FIVE_EXERCISES }: { onComplete: () => void; exercises?: BestFiveExercise[] }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const reduced = prefersReducedMotion(useSettingsStore((s) => s.settings));
  useEffect(() => {
    if (previousStep.current !== step || done) heading.current?.focus();
    previousStep.current = step;
  }, [step, done]);
  const exercise = exercises[step];
  const cards = [...exercise.hole, ...exercise.board];
  const result = checked ? assessBestFive(exercise, selected) : null;
  const solved = result?.correct === true;
  const choose = (index: number) => {
    if (solved || done) return;
    setChecked(false);
    setSelected((current) => current.includes(index) ? current.filter((i) => i !== index) : current.length < 5 ? [...current, index] : current);
    playSfx('chipTick');
  };
  const check = () => {
    const evaluation = assessBestFive(exercise, selected);
    if (!evaluation) return;
    setChecked(true);
    playSfx(evaluation.correct ? 'win' : 'incorrect');
  };
  const advance = () => {
    if (step === exercises.length - 1) { setDone(true); onComplete(); playSfx('levelUp'); }
    else { setStep((value) => value + 1); setSelected([]); setChecked(false); setHint(false); playSfx('click'); }
  };
  return (
    <section className="best-five" data-reduced={reduced} aria-labelledby="best-five-title">
      <div className="best-five-top"><span>BUILD YOUR BEST FIVE</span><span>{done ? 'COMPLETE' : `SPOT ${step + 1} OF ${exercises.length}`}</span></div>
      <div className="best-five-progress" aria-hidden="true">{exercises.map((item, i) => <span key={item.id} className={i < step || done ? 'complete' : i === step ? 'current' : ''} />)}</div>
      <h3 id="best-five-title" tabIndex={-1} ref={heading}>{done ? 'You’ve got an eye for the best five.' : exercise.title}</h3>
      {done ? <div className="best-five-finished" role="status"><p>You found a flush, kept the right kickers and recognised when the board plays.</p><p>Review the hand ladder below, then finish the lesson to unlock your next challenge.</p></div> : <>
        <p className="best-five-prompt">{exercise.prompt}</p>
        <div className="best-five-table">
          {[{ title: 'YOUR PRIVATE CARDS', indices: [0, 1] }, { title: 'COMMUNITY CARDS', indices: [2, 3, 4, 5, 6] }].map((group) => <div className="best-five-group" key={group.title} role="group" aria-label={group.title}>
            <span>{group.title}</span><div className="best-five-cards">{group.indices.map((index) => {
              const card = cards[index];
              const active = selected.includes(index);
              return <button key={`${exercise.id}-${index}`} type="button" className={`best-five-card${active ? ' is-selected' : ''}`} aria-pressed={active} aria-label={`${rankLabel(card.rank)} of ${SUITS[card.suit]}`} disabled={solved || (!active && selected.length === 5)} onClick={() => choose(index)}>
                <span aria-hidden="true"><PlayingCard card={card} size="md" /></span><span className="best-five-mark" aria-hidden="true">{active ? '✓' : '+'}</span>
              </button>;
            })}</div>
          </div>)}
        </div>
        <div className="best-five-selection" aria-live="polite"><strong>{selected.length} / 5 selected</strong><span>{selected.length === 5 ? 'Tap a selected card to swap it out.' : 'Tap cards to include them in your hand.'}</span></div>
        {result && <div className={`best-five-feedback${solved ? ' is-correct' : ''}`} role="status"><strong>{solved ? `Exactly right: ${HAND_CATEGORY_LABEL[result.best.category]}.` : `You made ${HAND_CATEGORY_LABEL[result.selected.category].toLowerCase()}. There’s a stronger five.`}</strong><p>{solved ? exercise.explanation : result.selected.category === result.best.category ? 'You found the right hand category. Now compare the kickers: keep the highest side cards you can.' : exercise.hint}</p></div>}
        <div className="best-five-actions">{solved ? <button className="btn btn-orange" onClick={advance}>{step === exercises.length - 1 ? 'FINISH THE EXERCISE' : 'NEXT SPOT'} →</button> : <button className="btn btn-orange" onClick={check} disabled={selected.length !== 5}>CHECK MY FIVE</button>}
          {!solved && <button className="best-five-hint-button" aria-expanded={hint} onClick={() => setHint((value) => !value)}>{hint ? 'Hide hint' : 'Give me a hint'}</button>}
        </div>
        {hint && !solved && <p className="best-five-hint">{exercise.hint}</p>}
      </>}
    </section>
  );
}
