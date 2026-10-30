import { useEffect, useRef, useState } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { SCRIPTED_HANDS_BY_ID } from '../../tutorial/content/scriptedHands';
import { buildScriptedGame, submitPracticeDecision, type PracticeDecision } from '../../tutorial/practice';
import { nextStepAfter } from '../../tutorial/progress/nextStep';
import type { Action } from '../../engine/types';
import { Table } from '../components/table/Table';
import { ActionControls } from '../components/controls/ActionControls';
import { playSfx } from '../lib/sound';
import './practice.css';

const ACTION_LABEL: Record<Action['type'], string> = {
  fold: 'Folded', check: 'Checked', call: 'Called', bet: 'Bet', raise: 'Raised to', allin: 'Went all-in', postBlind: 'Posted blind',
};

export function PracticeHandScreen({ handId }: { handId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const progress = useProgressStore((s) => s.progress);
  const hand = SCRIPTED_HANDS_BY_ID[handId];
  const [state, setState] = useState(() => hand ? buildScriptedGame(hand) : null);
  const [feedback, setFeedback] = useState<PracticeDecision | null>(null);
  const [showHint, setShowHint] = useState(false);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const focusOnRetry = useRef(false);
  useEffect(() => {
    if (feedback) feedbackHeading.current?.focus();
    else if (focusOnRetry.current) {
      controls.current?.querySelector<HTMLButtonElement>('.action-row-buttons button:not(:disabled)')?.focus();
      focusOnRetry.current = false;
    }
  }, [feedback]);

  if (!hand || !state) return <AppFrame variant="learn" active="learn"><div className="screen">Practice hand not found.</div></AppFrame>;

  const { game, heroId } = state;
  const checkpoint = hand.checkpoints.find((c) => c.atStreet === game.street);
  const heroToAct = game.toActSeatId === heroId && game.phase === 'betting';
  const next = feedback?.correct ? nextStepAfter('practice', handId, progress) : null;

  const onAction = (action: Action) => {
    if (!checkpoint || !heroToAct || locked.current) return;
    const decision = submitPracticeDecision(hand, state, action);
    locked.current = true;
    setState(decision.state);
    setFeedback(decision);
    if (decision.correct) record({ type: 'scriptedHandCompleted', handId });
    playSfx(decision.correct ? 'win' : 'incorrect');
  };
  const retry = () => {
    locked.current = false;
    focusOnRetry.current = true;
    setShowHint(false);
    setState(buildScriptedGame(hand));
    setFeedback(null);
    playSfx('click');
  };
  const continueLearning = () => {
    playSfx('click');
    if (!next || next.type === 'freePlay') go({ name: 'free' });
    else go({ name: next.type, id: next.refId });
  };
  const actionText = feedback ? `${ACTION_LABEL[feedback.action.type]}${feedback.action.amount !== undefined && ['bet', 'raise'].includes(feedback.action.type) ? ` ${feedback.action.amount.toLocaleString()}` : ''}` : '';

  return <AppFrame variant="learn" active="learn"><div className="screen practice decision-practice">
    <button className="link-back" onClick={() => go({ name: 'home' })}>← Back to the club</button>
    <div className="practice-eyebrow">ONE DECISION AT A TIME</div>
    <h2>{hand.title}</h2>
    <p className="subtitle">{hand.description}</p>
    <div className="practice-table-status" role="status"><span>{feedback ? 'TABLE PAUSED' : 'YOUR DECISION'}</span><p>{feedback ? 'Your move is on the table. Review the decision before continuing.' : 'Choose your move below. The table will pause so you can see what changed.'}</p></div>
    <Table game={game} />
    {checkpoint && !feedback && <div className="practice-guidance"><button className="practice-text-button" aria-expanded={showHint} aria-controls="practice-hint" onClick={() => setShowHint((value) => !value)}>{showHint ? 'Hide coaching hint' : 'Need a coaching hint?'}</button>{showHint && <p id="practice-hint">{checkpoint.coachText}</p>}</div>}
    {!feedback && <div className="play-controls" ref={controls}>{heroToAct && <ActionControls game={game} seatId={heroId} onAction={onAction} />}</div>}
    {feedback && <section className={`decision-feedback${feedback.correct ? ' is-correct' : ''}`} aria-labelledby="practice-feedback-title">
      <span className="practice-eyebrow">{feedback.correct ? 'DECISION COMPLETE' : 'A CHANCE TO TRY AGAIN'}</span>
      <h3 id="practice-feedback-title" ref={feedbackHeading} tabIndex={-1}>{feedback.correct ? 'A good decision. Here’s why.' : 'Let’s rethink that move.'}</h3>
      <div className="practice-receipt"><div><span>YOUR MOVE</span><strong>{actionText}</strong></div><div><span>CHIPS ADDED</span><strong>{feedback.chipsCommitted.toLocaleString()}</strong></div><div><span>YOUR STACK</span><strong>{feedback.stackBefore.toLocaleString()} → {feedback.stackAfter.toLocaleString()}</strong></div></div>
      <p className="practice-explanation">{feedback.explanation}</p>
      <p className="practice-footnote">This exercise scores the decision, not whether the next card would have made you win.</p>
      {feedback.correct ? <><div className="practice-next"><span>{next ? `${next.type === 'freePlay' ? 'TABLE PRACTICE' : next.type.toUpperCase()} UP NEXT` : 'READY TO PLAY'}</span><strong>{next ? next.title.replace(/^(Learn|Quiz|Practice|Play): /, '') : 'Put your skills to work at the table'}</strong></div><div className="practice-feedback-actions"><button className="btn btn-orange" onClick={continueLearning}>{next ? 'CONTINUE LEARNING' : 'PLAY A HAND'} →</button><button className="practice-text-button" onClick={retry}>Replay this decision</button></div></> : <div className="practice-feedback-actions"><button className="btn btn-orange" onClick={retry}>TRY THE SAME SPOT AGAIN</button><button className="practice-text-button" onClick={() => go({ name: 'home' })}>Back to my trail</button></div>}
    </section>}
  </div></AppFrame>;
}
