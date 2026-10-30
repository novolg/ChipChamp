import { create } from 'zustand';
import type { Progress, ProgressEvent } from '../../tutorial/types';
import { applyProgressEvent, emptyProgress } from '../../tutorial/progress/progressReducer';
import { loadProgress, saveProgress, STORAGE_KEY } from '../../tutorial/progress/storage';
import { resetDailyWithinProgressLock } from './dailyStore';
import { withProgressLock, type SaveResult } from './progressLock';

const now = () => new Date().toISOString();

export interface ProgressStore {
  progress: Progress;
  saved: boolean;
  saving: boolean;
  refresh: () => void;
  record: (event: ProgressEvent) => SaveResult;
  reset: () => SaveResult;
}

export const useProgressStore = create<ProgressStore>((set) => {
  let stored = loadProgress(now());
  let pending: ProgressEvent[] = [];
  let pendingReset = false;
  // Preview may read outside the lock; only flush writes, under the shared lock.
  const current = () => {
    stored = pendingReset ? emptyProgress(now()) : loadProgress(now(), undefined, stored);
    return pending.reduce((progress, event) => applyProgressEvent(progress, event, now()), stored);
  };
  const flush = (): SaveResult => withProgressLock(() => {
    const next = current();
    const dailySaved = !pendingReset || resetDailyWithinProgressLock();
    const saved = saveProgress(next) && dailySaved;
    if (saved) { stored = next; pending = []; pendingReset = false; }
    set({ progress: next, saved, saving: false });
    return saved;
  }, () => { set({ saved: false, saving: false }); return false; });
  return {
    progress: stored,
    saved: true,
    saving: false,
    refresh: () => set({ progress: current() }),
    record: (event) => {
      pending.push(event);
      set({ progress: current(), saving: true });
      return flush();
    },
    reset: () => {
      pending = [];
      pendingReset = true;
      set({ progress: emptyProgress(now()), saving: true });
      return flush();
    },
  };
});

if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
    useProgressStore.getState().refresh();
  }
});
