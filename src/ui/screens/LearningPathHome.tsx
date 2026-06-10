import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { isStepComplete, isStepUnlocked } from '../../tutorial/progress/progressReducer';
import type { LearningStep } from '../../tutorial/types';

const TYPE_LABEL: Record<LearningStep['type'], string> = {
  lesson: 'Lesson',
  quiz: 'Quiz',
  practice: 'Practice',
  freePlay: 'Play',
};

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

  return (
    <div className="screen path-home">
      <div className="path-intro">
        <h2>Your Learning Path</h2>
        <p className="subtitle">Work through the steps in order. Each unlocks the next.</p>
        <button className="btn" onClick={() => go({ name: 'free' })}>Skip to free play →</button>
      </div>

      <ol className="path-list">
        {LEARNING_PATH.map((step) => {
          const complete = isStepComplete(step, progress, QUIZZES_BY_ID);
          const unlocked = isStepUnlocked(step, LEARNING_PATH, progress, QUIZZES_BY_ID);
          const state = complete ? 'complete' : unlocked ? 'unlocked' : 'locked';
          return (
            <li key={step.id} className={`path-step path-step-${state}`}>
              <span className="path-marker">{complete ? '✓' : unlocked ? '●' : '🔒'}</span>
              <div className="path-step-body">
                <span className="path-type">{TYPE_LABEL[step.type]}</span>
                <span className="path-step-title">{step.title}</span>
              </div>
              <button className="btn" disabled={!unlocked} onClick={() => open(step)}>
                {complete ? 'Review' : 'Start'}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
