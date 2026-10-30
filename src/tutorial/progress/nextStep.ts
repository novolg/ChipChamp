import type { Progress, StepType } from '../types';
import { LEARNING_PATH } from '../content/learningPath';
import { QUIZZES_BY_ID } from '../content/quizzes';
import { isStepComplete, isStepUnlocked } from './progressReducer';

/** Prefer the next available step after this lesson, then unfinished earlier work. */
export function nextStepAfterLesson(lessonId: string, progress: Progress) {
  return nextStepAfter('lesson', lessonId, progress);
}

export function nextStepAfter(type: StepType, refId: string, progress: Progress) {
  const current = LEARNING_PATH.findIndex((s) => s.type === type && s.refId === refId);
  const ordered = [...LEARNING_PATH.slice(current + 1), ...LEARNING_PATH.slice(0, current + 1)];
  return ordered.find((step) => !isStepComplete(step, progress, QUIZZES_BY_ID) &&
    isStepUnlocked(step, LEARNING_PATH, progress, QUIZZES_BY_ID)) ?? null;
}
