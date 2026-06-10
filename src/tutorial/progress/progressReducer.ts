import type { LearningStep, Progress, ProgressEvent, Quiz } from '../types';

export function emptyProgress(now: string): Progress {
  return {
    version: 1,
    completedLessonIds: [],
    quizScores: {},
    completedScriptedHandIds: [],
    freePlayStats: { handsPlayed: 0, netChips: 0 },
    lastUpdated: now,
  };
}

/** Pure progress transition. `now` is injected so this stays deterministic/testable. */
export function applyProgressEvent(
  progress: Progress,
  event: ProgressEvent,
  now: string,
): Progress {
  const next: Progress = { ...progress, lastUpdated: now };

  switch (event.type) {
    case 'lessonCompleted':
      if (!next.completedLessonIds.includes(event.lessonId)) {
        next.completedLessonIds = [...next.completedLessonIds, event.lessonId];
      }
      return next;

    case 'quizAttempted': {
      const prev = next.quizScores[event.quizId] ?? { best: 0, attempts: 0 };
      next.quizScores = {
        ...next.quizScores,
        [event.quizId]: {
          best: Math.max(prev.best, event.score),
          attempts: prev.attempts + 1,
        },
      };
      return next;
    }

    case 'scriptedHandCompleted':
      if (!next.completedScriptedHandIds.includes(event.handId)) {
        next.completedScriptedHandIds = [...next.completedScriptedHandIds, event.handId];
      }
      return next;

    case 'freePlayHand':
      next.freePlayStats = {
        handsPlayed: next.freePlayStats.handsPlayed + 1,
        netChips: next.freePlayStats.netChips + event.netChips,
      };
      return next;

    default:
      return progress;
  }
}

/** Whether a learning step counts as completed, given current progress. */
export function isStepComplete(
  step: LearningStep,
  progress: Progress,
  quizzes: Record<string, Quiz>,
): boolean {
  switch (step.type) {
    case 'lesson':
      return progress.completedLessonIds.includes(step.refId);
    case 'practice':
      return progress.completedScriptedHandIds.includes(step.refId);
    case 'quiz': {
      const threshold = quizzes[step.refId]?.passThreshold ?? 1;
      return (progress.quizScores[step.refId]?.best ?? 0) >= threshold;
    }
    case 'freePlay':
      return progress.freePlayStats.handsPlayed >= (step.requiredHands ?? 1);
    default:
      return false;
  }
}

/** A step is unlocked when every prerequisite step is complete. */
export function isStepUnlocked(
  step: LearningStep,
  allSteps: LearningStep[],
  progress: Progress,
  quizzes: Record<string, Quiz>,
): boolean {
  return step.prereqIds.every((id) => {
    const prereq = allSteps.find((s) => s.id === id);
    return prereq ? isStepComplete(prereq, progress, quizzes) : true;
  });
}
