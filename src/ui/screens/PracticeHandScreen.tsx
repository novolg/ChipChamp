import { useState } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { SCRIPTED_HANDS_BY_ID } from '../../tutorial/content/scriptedHands';
import { buildScriptedGame } from '../../tutorial/practice';
import type { Action } from '../../engine/types';
import { Table } from '../components/table/Table';
import { ActionControls } from '../components/controls/ActionControls';
import { Confetti } from '../components/Confetti';

interface Feedback {
  correct: boolean;
  text: string;
}

export function PracticeHandScreen({ handId }: { handId: string }) {
  const go = useNavStore((s) => s.go);
  const record = useProgressStore((s) => s.record);
  const hand = SCRIPTED_HANDS_BY_ID[handId];

  const [state, setState] = useState(() => (hand ? buildScriptedGame(hand) : null));
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  if (!hand || !state) {
    return (
      <AppFrame variant="learn" active="learn">
        <div className="screen">Practice hand not found.</div>
      </AppFrame>
    );
  }

  const { game, heroId } = state;
  const checkpoint = hand.checkpoints.find((c) => c.atStreet === game.street);
  const heroToAct = game.toActSeatId === heroId && game.phase === 'betting';

  const onAction = (action: Action) => {
    if (!checkpoint) return;
    const ok =
      action.type === checkpoint.recommended ||
      (checkpoint.acceptable?.includes(action.type) ?? false);
    if (ok) record({ type: 'scriptedHandCompleted', handId });
    setFeedback({ correct: ok, text: ok ? checkpoint.explainRight : checkpoint.explainWrong });
  };

  const retry = () => {
    setFeedback(null);
    setState(buildScriptedGame(hand));
  };

  return (
    <AppFrame variant="learn" active="learn">
    <div className="screen practice">
      <button className="link-back" onClick={() => go({ name: 'home' })}>← Path</button>
      <h2>{hand.title}</h2>
      <p className="subtitle">{hand.description}</p>

      <Table game={game} />

      {checkpoint && !feedback && (
        <div className="practice-coach">
          <p>{checkpoint.coachText}</p>
        </div>
      )}

      <div className="play-controls">
        {heroToAct && !feedback && (
          <ActionControls game={game} seatId={heroId} onAction={onAction} />
        )}
      </div>

      {feedback && (
        <div className={`practice-feedback ${feedback.correct ? 'fb-right' : 'fb-wrong'}`}>
          {feedback.correct && <Confetti count={18} />}
          <p className="fb-head">{feedback.correct ? '✓ Nicely played' : '✗ Not quite'}</p>
          <p>{feedback.text}</p>
          {feedback.correct ? (
            <button className="btn btn-primary" onClick={() => go({ name: 'home' })}>Continue</button>
          ) : (
            <button className="btn" onClick={retry}>Try again</button>
          )}
        </div>
      )}
    </div>
    </AppFrame>
  );
}
