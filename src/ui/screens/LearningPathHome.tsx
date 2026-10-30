import { useState } from 'react';
import { useDailyStore } from '../store/dailyStore';
import { useLocalDay } from '../hooks/useLocalDay';
import { dailyStats } from '../../tutorial/dailyChallenge';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { useGameStore, type Difficulty } from '../store/gameStore';
import { useSettingsStore, prefersReducedMotion } from '../store/settingsStore';
import { AppFrame } from '../components/AppFrame';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { isStepComplete, isStepUnlocked } from '../../tutorial/progress/progressReducer';
import { playSfx } from '../lib/sound';
import type { LearningStep } from '../../tutorial/types';
import './lobby.css';

const RIVALS: { name: string; art: string; difficulty: Difficulty; label: string; description: string }[] = [
  { name: 'Ava', art: 'ava', difficulty: 'easy', label: 'WARM UP', description: 'A forgiving heads-up table. Practise reading the board and choosing your bets.' },
  { name: 'Ben', art: 'ben', difficulty: 'medium', label: 'FIND YOUR EDGE', description: 'A balanced heads-up challenge. Choose your spots and make each chip count.' },
  { name: 'Cleo', art: 'cleo', difficulty: 'hard', label: 'STEP IT UP', description: 'A tighter, more aggressive opponent. Practise handling pressure and picking your calls.' },
];
const cleanTitle = (title: string) => title.replace(/^(Learn|Quiz|Practice|Play): /, '');

export function LearningPathHome() {
  const daily = dailyStats(useDailyStore((s) => s.days), useLocalDay());
  const go = useNavStore((s) => s.go);
  const progress = useProgressStore((s) => s.progress);
  const game = useGameStore((s) => s.game);
  const reduced = prefersReducedMotion(useSettingsStore((s) => s.settings));
  const [rivalIndex, setRivalIndex] = useState(0);
  const [answer, setAnswer] = useState<'straight' | 'flush' | null>(null);
  const [replace, setReplace] = useState(false);
  const rival = RIVALS[rivalIndex];
  const steps = LEARNING_PATH.map((step) => ({ step,
    complete: isStepComplete(step, progress, QUIZZES_BY_ID),
    unlocked: isStepUnlocked(step, LEARNING_PATH, progress, QUIZZES_BY_ID),
  }));
  const next = steps.find((s) => s.unlocked && !s.complete);
  const done = steps.filter((s) => s.complete).length;
  const resumable = game !== null && (game.phase === 'betting' || (game.seats.find((s) => s.isHuman)?.stack ?? 0) > 0);
  const open = (step: LearningStep) => {
    playSfx('click');
    if (step.type === 'freePlay') go({ name: 'free' });
    else go({ name: step.type, id: step.refId });
  };
  const startRival = () => {
    playSfx('click');
    useGameStore.getState().newGame(rival.difficulty, rival.name);
    go({ name: 'free' });
  };
  return (
    <AppFrame variant="learn" active="learn">
      <div className="lobby" data-reduced={reduced}>
        <div className="lobby-heading"><div><span className="lobby-eyebrow">YOUR POKER CLUB</span><h1>Pull up a chair.</h1></div><p>Learn a little. Play a hand. <br />Find your next good decision.</p></div>
        <div className="lobby-top">
          <section className="lobby-continue">
            <div className="lobby-continue-copy">
              <span className="lobby-eyebrow">{resumable ? 'YOUR TABLE IS WAITING' : done ? 'PICK UP WHERE YOU LEFT OFF' : 'YOUR FIRST GOOD HAND STARTS HERE'}</span>
              <h2>{resumable ? `Back to hand ${game.handNumber}` : next ? cleanTitle(next.step.title) : 'You know the fundamentals.'}</h2>
              <p>{resumable ? 'Return to your current session. Your table stays here while you explore.' : next ? 'Build your instincts, one small decision at a time.' : 'Revisit a skill or put your knowledge to work at the table.'}</p>
              <button className="btn btn-orange" onClick={() => resumable || !next ? go({ name: 'free' }) : open(next.step)}>{resumable ? 'RETURN TO TABLE' : next ? done ? 'CONTINUE LEARNING' : 'TAKE YOUR FIRST LESSON' : 'PLAY A HAND'} <span aria-hidden="true">↗</span></button>
              <span className="lobby-progress-label">{done} of {steps.length} milestones completed</span>
              <progress aria-label="Learning path progress" value={done} max={steps.length} />
            </div>
            <div className="lobby-card-fan" aria-hidden="true"><span>A<small>♠</small></span><span>K<small>♠</small></span><img src="/assets/chip-orange.png" alt="" /></div>
          </section>
          <section className="lobby-rival" aria-label="Choose your opponent">
            <img key={rival.art} className="lobby-rival-art" src={`/assets/indigo/bot-${rival.art}.webp`} alt="" />
            <div className="lobby-rival-copy"><span className="lobby-eyebrow">{rival.label}</span><h2>Meet {rival.name}.</h2><p>{rival.description}</p></div>
            <div className="lobby-rival-controls"><div className="lobby-rival-picks" role="group" aria-label="Opponent">
              {RIVALS.map((r, i) => <button key={r.name} aria-pressed={i === rivalIndex} onClick={() => { setRivalIndex(i); setReplace(false); playSfx('click'); }}><span>{r.name}</span><small>{r.difficulty}</small></button>)}
            </div>
            {replace ? <div className="lobby-replace" role="status"><p>Replace your current table with a new game against {rival.name}?</p><button className="btn btn-orange" onClick={startRival}>START NEW TABLE</button><button className="lobby-text-button" onClick={() => setReplace(false)}>Keep my table</button></div>
              : <button className="btn btn-dark" onClick={() => game ? setReplace(true) : startRival()}>PLAY {rival.name.toUpperCase()} <span aria-hidden="true">→</span></button>}
            </div>
          </section>
        </div>
        <div className="lobby-bottom">
          <section className="lobby-path" aria-labelledby="path-title">
            <div className="lobby-section-head"><h2 id="path-title">Your learning trail</h2><span>{done === steps.length ? 'Ready for the table' : 'Small steps. Better instincts.'}</span></div>
            <ol>{steps.map(({ step, complete, unlocked }, i) => <li key={step.id}>
              <button className={`lobby-step ${complete ? 'is-complete' : ''}`} disabled={!unlocked && !complete} aria-current={next?.step.id === step.id ? 'step' : undefined} onClick={() => open(step)}>
                <span className="lobby-step-number">{complete ? '✓' : String(i + 1).padStart(2, '0')}</span><span className="lobby-step-title">{cleanTitle(step.title)}<small>{step.type === 'freePlay' ? 'Table practice' : step.type}{complete ? ' · Ready to review' : !unlocked ? ' · Complete earlier steps to unlock' : ''}</small></span><span className="lobby-step-arrow" aria-hidden="true">{unlocked || complete ? '↗' : '—'}</span>
              </button>
            </li>)}</ol>
          </section>
          <aside className="lobby-side">
            <button className="lobby-lab lobby-daily" onClick={() => { playSfx('click'); go({ name: 'daily' }); }}><span className="lobby-eyebrow">{daily.completed ? 'TODAY’S HAND · COMPLETE ✓' : 'A FRESH HAND EACH DAY'}</span><strong>The daily five</strong><span>{daily.streak ? `${daily.streak}-day streak. Keep your instincts sharp.` : 'Seven cards. One best hand. Build your daily habit.'}</span><b>{daily.completed ? 'REVIEW TODAY’S HAND' : 'PLAY TODAY’S CHALLENGE'} →</b></button>
            <section className="lobby-quick"><span className="lobby-eyebrow">A 10-SECOND WARM-UP</span><h2>Which hand wins?</h2><p>No tricks. Just your poker instincts.</p><div className="lobby-quick-options">
              <button aria-pressed={answer === 'straight'} disabled={answer !== null} onClick={() => { setAnswer('straight'); playSfx('incorrect'); }}><span aria-hidden="true">9♣ 8♦ 7♥ 6♠ 5♣</span>Straight</button>
              <button aria-pressed={answer === 'flush'} disabled={answer !== null} onClick={() => { setAnswer('flush'); playSfx('win'); }}><span aria-hidden="true">A♠ J♠ 9♠ 5♠ 2♠</span>Flush</button>
            </div><div className="lobby-quick-feedback" aria-live="polite">{answer ? <><strong>{answer === 'flush' ? 'That’s it.' : 'Close. The flush wins.'}</strong> Five cards of one suit beat five cards in a row.<button className="lobby-text-button" onClick={() => go({ name: 'lesson', id: 'hand-rankings' })}>Explore the hand rankings →</button></> : 'Pick a hand to reveal the answer.'}</div></section>
            <button className="lobby-lab" onClick={() => { playSfx('click'); go({ name: 'lesson', id: 'pot-odds' }); }}><span className="lobby-eyebrow">TRY THE INTERACTIVE LAB</span><strong>Is the call worth it?</strong><span>Make a decision. Move the chips. Find the tipping point.</span><b>EXPLORE POT ODDS <span aria-hidden="true">↗</span></b></button>
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}
