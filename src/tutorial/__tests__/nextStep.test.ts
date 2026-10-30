import { describe, expect, it } from 'vitest';
import { nextStepAfterLesson, nextStepAfter } from '../progress/nextStep';
import { emptyProgress } from '../progress/progressReducer';

describe('lesson continuation', () => {
  it('continues completed fold practice into the position lesson', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedScriptedHandIds = ['practice-fold-trash'];
    expect(nextStepAfter('practice', 'practice-fold-trash', progress)?.refId).toBe('positions');
  });
  it('continues completed raise practice into pot odds', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedScriptedHandIds = ['practice-raise-premium'];
    expect(nextStepAfter('practice', 'practice-raise-premium', progress)?.refId).toBe('pot-odds');
  });
  it('continues from position training into the premium-hand practice', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedLessonIds = ['rules-basics', 'hand-rankings', 'positions'];
    progress.quizScores = { 'quiz-rankings': { best: 1, attempts: 1 } };
    progress.completedScriptedHandIds = ['practice-fold-trash'];
    expect(nextStepAfterLesson('positions', progress)?.refId).toBe('practice-raise-premium');
  });
  it('continues from the basics to hand rankings', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedLessonIds = ['rules-basics'];
    expect(nextStepAfterLesson('rules-basics', progress)?.refId).toBe('hand-rankings');
  });
  it('offers the newly unlocked ranking quiz', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedLessonIds = ['rules-basics', 'hand-rankings'];
    expect(nextStepAfterLesson('hand-rankings', progress)?.refId).toBe('quiz-rankings');
  });
  it('does not offer locked work when reviewing an earlier lesson', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedLessonIds = ['rules-basics', 'hand-rankings', 'positions'];
    expect(nextStepAfterLesson('rules-basics', progress)?.refId).toBe('quiz-rankings');
  });
  it('offers the odds quiz after direct lab completion', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedLessonIds = ['pot-odds'];
    expect(nextStepAfterLesson('pot-odds', progress)?.refId).toBe('quiz-odds');
  });
  it('returns no next step for a completed path', () => {
    const progress = emptyProgress('2026-10-21');
    progress.completedLessonIds = ['rules-basics', 'hand-rankings', 'positions', 'pot-odds'];
    progress.completedScriptedHandIds = ['practice-fold-trash', 'practice-raise-premium'];
    progress.quizScores = { 'quiz-rankings': { best: 1, attempts: 1 }, 'quiz-odds': { best: 1, attempts: 1 } };
    progress.freePlayStats.handsPlayed = 5;
    expect(nextStepAfterLesson('pot-odds', progress)).toBeNull();
  });
});
