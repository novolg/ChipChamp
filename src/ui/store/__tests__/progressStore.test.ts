import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress } from '../../../tutorial/progress/progressReducer';
import { STORAGE_KEY } from '../../../tutorial/progress/storage';

describe('progress across stale tabs and failed writes', () => {
  let data: Record<string, string>;
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, write: () => boolean) => write() } });
    data = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => { data[key] = value; },
      removeItem: (key: string) => { delete data[key]; },
    });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does not write before acquiring the lock and rebases after the lock is granted', async () => {
    let grant!: () => void;
    vi.stubGlobal('navigator', { locks: { request: (_name: string, write: () => boolean) => new Promise<boolean>(resolve => { grant = () => resolve(write()); }) } });
    const { useProgressStore: store } = await import('../progressStore');
    const saved = store.getState().record({ type: 'lessonCompleted', lessonId: 'positions' });
    expect(data[STORAGE_KEY]).toBeUndefined();
    expect(store.getState().saving).toBe(true);
    data[STORAGE_KEY] = JSON.stringify({ ...emptyProgress('remote'), completedLessonIds: ['rules-basics'] });
    grant();
    expect(await saved).toBe(true);
    expect(JSON.parse(data[STORAGE_KEY]).completedLessonIds).toEqual(['rules-basics', 'positions']);
  });

  it('keeps progress in memory if browser locks are unavailable or rejected', async () => {
    vi.stubGlobal('navigator', {});
    const { useProgressStore: store } = await import('../progressStore');
    expect(await store.getState().record({ type: 'lessonCompleted', lessonId: 'positions' })).toBe(false);
    expect(data[STORAGE_KEY]).toBeUndefined();
    expect(store.getState().progress.completedLessonIds).toEqual(['positions']);
    vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(Error('denied')) } });
    expect(await store.getState().record({ type: 'lessonCompleted', lessonId: 'rules-basics' })).toBe(false);
    expect(store.getState().saving).toBe(false);
  });

  it('reads another tab before recording a new completion', async () => {
    const { useProgressStore: store } = await import('../progressStore');
    data[STORAGE_KEY] = JSON.stringify({ ...emptyProgress('now'), completedLessonIds: ['rules-basics'] });
    await store.getState().record({ type: 'lessonCompleted', lessonId: 'hand-rankings' });
    expect(store.getState().progress.completedLessonIds).toEqual(['rules-basics', 'hand-rankings']);
  });

  it('refreshes resets and does not resurrect old completions on the next action', async () => {
    const { useProgressStore: store } = await import('../progressStore');
    await store.getState().record({ type: 'lessonCompleted', lessonId: 'rules-basics' });
    data[STORAGE_KEY] = JSON.stringify(emptyProgress('reset'));
    store.getState().refresh();
    expect(store.getState().progress.completedLessonIds).toEqual([]);
    await store.getState().record({ type: 'lessonCompleted', lessonId: 'positions' });
    expect(store.getState().progress.completedLessonIds).toEqual(['positions']);
  });

  it('replays unsaved events over remote progress and saves each quiz attempt once', async () => {
    const { useProgressStore: store } = await import('../progressStore');
    const write = localStorage.setItem;
    localStorage.setItem = () => { throw Error('quota'); };
    await store.getState().record({ type: 'quizAttempted', quizId: 'quiz-rankings', score: 0.5 });
    expect(store.getState().saved).toBe(false);
    data[STORAGE_KEY] = JSON.stringify({ ...emptyProgress('remote'), completedLessonIds: ['positions'] });
    store.getState().refresh();
    store.getState().refresh();
    expect(store.getState().progress.quizScores['quiz-rankings'].attempts).toBe(1);
    localStorage.setItem = write;
    await store.getState().record({ type: 'quizAttempted', quizId: 'quiz-rankings', score: 1 });
    expect(store.getState().saved).toBe(true);
    expect(store.getState().progress.completedLessonIds).toEqual(['positions']);
    expect(store.getState().progress.quizScores['quiz-rankings']).toEqual({ best: 1, attempts: 2 });
  });

  it('keeps a failed reset pending instead of restoring the old stored record', async () => {
    const { useProgressStore: store } = await import('../progressStore');
    await store.getState().record({ type: 'lessonCompleted', lessonId: 'rules-basics' });
    const write = localStorage.setItem;
    localStorage.setItem = () => { throw Error('quota'); };
    await store.getState().reset();
    store.getState().refresh();
    expect(store.getState().progress.completedLessonIds).toEqual([]);
    localStorage.setItem = write;
    await store.getState().record({ type: 'lessonCompleted', lessonId: 'positions' });
    expect(store.getState().progress.completedLessonIds).toEqual(['positions']);
  });
});
