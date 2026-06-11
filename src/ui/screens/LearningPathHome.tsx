import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { isStepComplete, isStepUnlocked } from '../../tutorial/progress/progressReducer';
import type { LearningStep } from '../../tutorial/types';

const TYPE_LABEL: Record<LearningStep['type'], string> = {
  lesson: 'LESSON',
  quiz: 'QUIZ',
  practice: 'PRACTICE',
  freePlay: 'PLAY',
};

const cleanTitle = (t: string) => t.replace(/^(Learn|Quiz|Practice|Play): /, '');

export function LearningPathHome() {
  const go = useNavStore((s) => s.go);
  const progress = useProgressStore((s) => s.progress);

  const open = (step: LearningStep) => {
    switch (step.type) {
      case 'lesson': return go({ name: 'lesson', id: step.refId });
      case 'quiz': return go({ name: 'quiz', id: step.refId });
      case 'practice': return go({ name: 'practice', id: step.refId });
      case 'freePlay': return go({ name: 'free' });
    }
  };

  const steps = LEARNING_PATH.map((step) => ({
    step,
    complete: isStepComplete(step, progress, QUIZZES_BY_ID),
    unlocked: isStepUnlocked(step, LEARNING_PATH, progress, QUIZZES_BY_ID),
  }));
  const doneCount = steps.filter((s) => s.complete).length;
  const total = steps.length;
  const currentIndex = steps.findIndex((s) => s.unlocked && !s.complete);

  return (
    <AppFrame variant="learn" active="learn">
      <div className="learn">
        <div className="learn-grid">
          {steps.map(({ step, complete, unlocked }, i) => {
            const state = complete ? 'complete' : unlocked ? 'active' : 'locked';
            const lockedCaption =
              i === currentIndex + 1 ? `FINISH STEP ${currentIndex + 1} TO UNLOCK` : 'LOCKED';
            return (
              <div key={step.id} className={`tile tile-${state}`}>
                <div className="tile-head">
                  <span className={`tile-type tile-type-${state}`}>{TYPE_LABEL[step.type]}</span>
                  <span className="tile-num">{complete ? '✓' : i + 1}</span>
                </div>
                <div className="tile-title">{cleanTitle(step.title)}</div>
                {state === 'active' && (
                  <button className="btn btn-blue tile-btn" onClick={() => open(step)}>START</button>
                )}
                {state === 'complete' && (
                  <button className="btn btn-outline-green tile-btn" onClick={() => open(step)}>REVIEW</button>
                )}
                {state === 'locked' && <div className="tile-lock-cap">{lockedCaption}</div>}
              </div>
            );
          })}
        </div>

        <div className="learn-strip">
          <span className="learn-run-label">YOUR RUN</span>
          <div className="learn-chips">
            <span className="learn-chip-row" aria-hidden="true">
              {Array.from({ length: total }).map((_, i) => (
                <img
                  key={i}
                  src={i < doneCount ? '/assets/chip-orange.png' : '/assets/chip-dark.png'}
                  alt=""
                  className={`learn-chip${i < doneCount ? ' learn-chip-earned' : ''}`}
                />
              ))}
            </span>
            <span className="learn-chip-count">{doneCount} of {total} chips earned</span>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
