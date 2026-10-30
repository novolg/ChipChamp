import { useEffect, useRef, useState } from 'react';
import { AppFrame } from '../components/AppFrame';
import { LessonCompletion } from '../components/lesson/LessonCompletion';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { useSettingsStore, prefersReducedMotion } from '../store/settingsStore';
import { playSfx } from '../lib/sound';
import { ODDS_DECISIONS, requiredEquity } from '../../tutorial/potOddsLab';
import './potOddsLesson.css';

const STAGES = ['Read the spot', 'Find the tipping point', 'Try it yourself', 'Take it to the table'];
const pct = (value: number) => `${Math.round(value * 100)}%`;

export function PotOddsLesson() {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const reduced = prefersReducedMotion(useSettingsStore((s) => s.settings));
  const [stage, setStage] = useState(0);
  const [answer, setAnswer] = useState<'call' | 'fold' | null>(null);
  const [hint, setHint] = useState(0);
  const [bet, setBet] = useState(20);
  const [exploredCall, setExploredCall] = useState(false);
  const [exploredFold, setExploredFold] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [stage]);
  const scenario = ODDS_DECISIONS[stage === 2 ? 1 : 0];
  const pot = stage === 1 ? 80 + bet : scenario.pot;
  const call = stage === 1 ? bet : scenario.call;
  const equity = stage === 1 ? 0.25 : scenario.equity;
  const needed = requiredEquity(pot, call);
  const verdict = Math.abs(needed - equity) < 0.00001 ? 'BREAK-EVEN' : equity > needed ? 'CALL' : 'FOLD';
  const advance = () => { playSfx('click'); setAnswer(null); setHint(0); setStage((s) => s + 1); };
  const choose = (choice: 'call' | 'fold') => { setAnswer(choice); playSfx(choice === scenario.correct ? 'win' : 'incorrect'); };
  const finish = () => { record({ type: 'lessonCompleted', lessonId: 'pot-odds' }); playSfx('levelUp'); setStage(3); };
  return <AppFrame variant="learn" active="learn"><div className="odds-lab" data-reduced={reduced}>
    <div className="odds-topline"><button className="link-back" onClick={() => go({ name: 'home' })}>← Back to the club</button><span>THE POT ODDS LAB</span><span>ABOUT 2 MINUTES</span></div>
    <ol className="odds-stages" aria-label="Lesson progress">{STAGES.map((title, i) => <li key={title} aria-current={stage === i ? 'step' : undefined} className={i < stage ? 'is-done' : ''}><span>{i < stage ? '✓' : i + 1}</span>{title}</li>)}</ol>
    <header className="odds-heading"><span className="odds-kicker">{stage === 3 ? 'SKILL PRACTISED' : 'GOOD DECISIONS START WITH THE PRICE'}</span><h1 ref={heading} tabIndex={-1}>{['Would you pay to see it?', 'Change the price. Change the play.', 'Same idea. A different price.', 'You can now price a call.'][stage]}</h1><p>{['You’re facing an all-in on the river. The only choices are call or fold. What would you do?', 'The pot starts at 80. Move the opponent’s bet and watch the price of your call change.', 'One more all-in on the river. Use the pot and call amount to make your decision.', 'Compare your chance of winning with the price the pot is offering. That’s the habit to take into your next hand.'][stage]}</p></header>
    {stage < 3 ? <div className="odds-workspace">
      <section className="odds-table" aria-label="Practice scenario">
        <div className="odds-opponent"><img src="/assets/indigo/bot-ben.webp" alt="Ben, your practice opponent" /><span>BEN <b>ALL-IN</b></span></div>
        <div className="odds-felt"><div className="odds-chip-pile" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <img key={i} style={{ left: `${i * 15}px`, bottom: `${(i % 3) * 6}px` }} src={`/assets/chip-${i % 2 ? 'blue' : 'orange'}.png`} alt="" />)}</div><span>POT INCLUDING BEN’S BET</span><strong>{pot}</strong><div className="odds-table-rule" /><div className="odds-price"><span>YOUR CALL<b>{call}</b></span><span>FINAL POT IF YOU CALL<b>{pot + call}</b></span></div></div>
        <div className="odds-equity"><span>YOUR ASSUMED EQUITY</span><strong>{pct(equity)}</strong><small>For this exercise, you win {pct(equity)} of the time.</small></div>
        <p className="odds-assumption">A simplified heads-up example: no further betting, no rake. Equity is supplied for practice, not calculated from cards.</p>
      </section>
      <section className="odds-coach" aria-label="Decision and explanation">
        <span className="odds-kicker">{stage === 1 ? 'YOUR EXPERIMENT' : stage === 2 ? 'YOUR TURN' : 'TRUST YOUR FIRST INSTINCT'}</span>
        {stage === 1 ? <>
          <h2>Where does a call stop paying?</h2><label className="odds-slider-label" htmlFor="opponent-bet">Ben’s bet <strong>{bet} chips</strong></label><input id="opponent-bet" type="range" min="10" max="100" step="5" value={bet} onChange={(e) => { const value = Number(e.target.value); setBet(value); const need = requiredEquity(80 + value, value); if (need < .25) setExploredCall(true); if (need > .25) setExploredFold(true); }} />
          <div className="odds-slider-ends"><span>10 chips</span><button onClick={() => { setBet(40); playSfx('chipTick'); }}>Find break-even: 40</button><span>100 chips</span></div>
          <div className="odds-formula"><span>PRICE OF THE CALL</span><strong>{call} ÷ {pot + call} = {pct(needed)}</strong></div>
          <div className="odds-meter" role="img" aria-label={`Required equity ${pct(needed)}; your equity ${pct(equity)}`}><span style={{ width: `${needed * 200}%` }} /><i style={{ left: `${equity * 200}%` }} /></div><div className="odds-meter-labels"><span>Required: {pct(needed)}</span><span>Your equity: 25%</span></div>
          <div className={`odds-verdict odds-verdict-${verdict.toLowerCase()}`} aria-live="polite"><strong>{verdict}</strong><span>{verdict === 'BREAK-EVEN' ? 'At 40 chips, the call earns zero on average.' : verdict === 'CALL' ? 'Your equity is higher than the price.' : 'The price is higher than your equity.'}</span></div>
          <p className="odds-explore-checks">{exploredCall ? '✓' : '○'} Find a profitable call <br />{exploredFold ? '✓' : '○'} Find a price worth folding</p>
          <button className="btn btn-orange" disabled={!exploredCall || !exploredFold} onClick={advance}>TEST MY INSTINCTS →</button>
        </> : <>
          <h2>{stage === 0 ? 'Call or let it go?' : 'Is this call worth the chips?'}</h2><p>A good decision can still lose a hand. We’re looking for the choice that pays over many hands.</p>
          <div className="odds-choices"><button className="btn btn-dark" disabled={answer !== null} aria-pressed={answer === 'fold'} onClick={() => choose('fold')}>FOLD</button><button className="btn btn-orange" disabled={answer !== null} aria-pressed={answer === 'call'} onClick={() => choose('call')}>CALL {call}</button></div>
          <div aria-live="polite">{answer !== null ? <div className={`odds-feedback ${answer === scenario.correct ? 'is-right' : ''}`}><strong>{answer === scenario.correct ? 'Good read.' : 'Let’s look at the price.'}</strong><p>{scenario.explanation}</p><div className="odds-formula"><span>REQUIRED EQUITY</span><strong>{call} ÷ ({pot} + {call}) = {pct(needed)}</strong></div>{answer !== scenario.correct && <button className="odds-hint-button" onClick={() => { setAnswer(null); playSfx('click'); }}>Try this decision again →</button>}</div> : <><button className="odds-hint-button" disabled={hint === 3} onClick={() => setHint((h) => Math.min(3, h + 1))}>{['Need a nudge?', 'Show me the calculation', 'Explain the answer', 'All hints revealed'][hint]}</button>{hint > 0 && <p className="odds-hint">{hint === 1 ? 'Compare the price of calling with your chance of winning. Include your call in the final pot.' : hint === 2 ? `Divide ${call} by ${pot + call}. You need ${pct(needed)} equity to break even.` : scenario.explanation}</p>}</>}</div>
          {answer === scenario.correct && <button className="btn btn-orange odds-next" onClick={stage === 2 ? finish : advance}>{stage === 2 ? 'FINISH THE LESSON' : 'LET ME EXPERIMENT'} →</button>}
        </>}
      </section>
    </div> : <LessonCompletion lessonId="pot-odds" title="Your new table habit"
      takeaway="Cost of calling divided by the final pot gives your required equity. Compare that price with your estimated chance of winning."
      onReplay={() => { setStage(0); setAnswer(null); setHint(0); setBet(20); setExploredCall(false); setExploredFold(false); }} />}
  </div></AppFrame>;
}
