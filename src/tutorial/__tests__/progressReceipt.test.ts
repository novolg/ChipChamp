import { expect, it } from 'vitest';
import { applyProgressEvent, emptyProgress } from '../progress/progressReducer';
import { loadProgress } from '../progress/storage';

it('sanitizes damaged nested progress without discarding valid lesson IDs', () => {
  const progress = loadProgress('now', { getItem: () => JSON.stringify({ version: 1, completedLessonIds: ['rules-basics', 42, 'rules-basics'], completedScriptedHandIds: null, freePlayStats: { handsPlayed: -5, netChips: 'NaN' }, quizScores: { bad: null, good: { best: 2, attempts: -1 } } }), setItem: () => {} });
  expect(progress.completedLessonIds).toEqual(['rules-basics']);
  expect(progress.completedScriptedHandIds).toEqual([]);
  expect(progress.freePlayStats).toEqual({ handsPlayed: 0, netChips: 0 });
  expect(progress.quizScores).toEqual({ good: { best: 1, attempts: 0 } });
});

it('replaying the same completed-hand receipt after a crash does not count twice', () => {
  const event = { type: 'freePlayHand' as const, netChips: -10, handId: 'session-1:hand-2' };
  const first = applyProgressEvent(emptyProgress('now'), event, 'later');
  const restored = JSON.parse(JSON.stringify(first));
  expect(applyProgressEvent(restored, event, 'recovered')).toEqual(first);
  const second = applyProgressEvent(first, { ...event, handId: 'session-1:hand-3' }, 'next');
  expect(second.freePlayStats).toEqual({ handsPlayed: 2, netChips: -20 });
});
