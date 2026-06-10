import { describe, it, expect } from 'vitest';
import {
  emptyProgress,
  applyProgressEvent,
  isStepComplete,
  isStepUnlocked,
} from '../progress/progressReducer';
import { loadProgress, saveProgress, STORAGE_KEY, type StorageAdapter } from '../progress/storage';
import { LEARNING_PATH } from '../content/learningPath';
import { QUIZZES_BY_ID } from '../content/quizzes';

const NOW = '2026-06-10T00:00:00.000Z';

function memAdapter(initial?: Record<string, string>): StorageAdapter {
  const m = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('applyProgressEvent', () => {
  it('records a completed lesson without duplicates', () => {
    let p = emptyProgress(NOW);
    p = applyProgressEvent(p, { type: 'lessonCompleted', lessonId: 'rules-basics' }, NOW);
    p = applyProgressEvent(p, { type: 'lessonCompleted', lessonId: 'rules-basics' }, NOW);
    expect(p.completedLessonIds).toEqual(['rules-basics']);
  });

  it('keeps the best quiz score and counts attempts', () => {
    let p = emptyProgress(NOW);
    p = applyProgressEvent(p, { type: 'quizAttempted', quizId: 'quiz-rankings', score: 0.33 }, NOW);
    p = applyProgressEvent(p, { type: 'quizAttempted', quizId: 'quiz-rankings', score: 1 }, NOW);
    p = applyProgressEvent(p, { type: 'quizAttempted', quizId: 'quiz-rankings', score: 0.5 }, NOW);
    expect(p.quizScores['quiz-rankings']).toEqual({ best: 1, attempts: 3 });
  });

  it('accumulates free-play stats', () => {
    let p = emptyProgress(NOW);
    p = applyProgressEvent(p, { type: 'freePlayHand', netChips: 120 }, NOW);
    p = applyProgressEvent(p, { type: 'freePlayHand', netChips: -40 }, NOW);
    expect(p.freePlayStats).toEqual({ handsPlayed: 2, netChips: 80 });
  });

  it('does not mutate the input', () => {
    const p = emptyProgress(NOW);
    applyProgressEvent(p, { type: 'lessonCompleted', lessonId: 'x' }, NOW);
    expect(p.completedLessonIds).toEqual([]);
  });
});

describe('learning path gating', () => {
  it('unlocks only the first step initially', () => {
    const p = emptyProgress(NOW);
    const [first, second] = LEARNING_PATH;
    expect(isStepUnlocked(first, LEARNING_PATH, p, QUIZZES_BY_ID)).toBe(true);
    expect(isStepUnlocked(second, LEARNING_PATH, p, QUIZZES_BY_ID)).toBe(false);
  });

  it('unlocks the next step after completing prerequisites', () => {
    let p = emptyProgress(NOW);
    p = applyProgressEvent(p, { type: 'lessonCompleted', lessonId: 'rules-basics' }, NOW);
    const rankings = LEARNING_PATH.find((s) => s.id === 'step-rankings')!;
    expect(isStepUnlocked(rankings, LEARNING_PATH, p, QUIZZES_BY_ID)).toBe(true);
  });

  it('treats a quiz step complete only when the pass threshold is met', () => {
    const quizStep = LEARNING_PATH.find((s) => s.id === 'step-quiz-rankings')!;
    let p = emptyProgress(NOW);
    p = applyProgressEvent(p, { type: 'quizAttempted', quizId: 'quiz-rankings', score: 0.33 }, NOW);
    expect(isStepComplete(quizStep, p, QUIZZES_BY_ID)).toBe(false);
    p = applyProgressEvent(p, { type: 'quizAttempted', quizId: 'quiz-rankings', score: 1 }, NOW);
    expect(isStepComplete(quizStep, p, QUIZZES_BY_ID)).toBe(true);
  });
});

describe('storage', () => {
  it('round-trips progress through the adapter', () => {
    const adapter = memAdapter();
    let p = emptyProgress(NOW);
    p = applyProgressEvent(p, { type: 'lessonCompleted', lessonId: 'rules-basics' }, NOW);
    saveProgress(p, adapter);
    const loaded = loadProgress('2026-06-11T00:00:00.000Z', adapter);
    expect(loaded.completedLessonIds).toEqual(['rules-basics']);
  });

  it('falls back to fresh progress on corrupt data', () => {
    const adapter = memAdapter({ [STORAGE_KEY]: '{not valid json' });
    const loaded = loadProgress(NOW, adapter);
    expect(loaded.completedLessonIds).toEqual([]);
    expect(loaded.version).toBe(1);
  });

  it('falls back on a version mismatch', () => {
    const adapter = memAdapter({ [STORAGE_KEY]: JSON.stringify({ version: 99 }) });
    const loaded = loadProgress(NOW, adapter);
    expect(loaded.version).toBe(1);
    expect(loaded.completedLessonIds).toEqual([]);
  });

  it('does nothing without an adapter (no throw)', () => {
    expect(() => saveProgress(emptyProgress(NOW), null)).not.toThrow();
    expect(loadProgress(NOW, null).version).toBe(1);
  });
});
