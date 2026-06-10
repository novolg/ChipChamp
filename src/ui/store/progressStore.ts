import { create } from 'zustand';
import type { Progress, ProgressEvent } from '../../tutorial/types';
import { applyProgressEvent, emptyProgress } from '../../tutorial/progress/progressReducer';
import { loadProgress, saveProgress } from '../../tutorial/progress/storage';

const now = () => new Date().toISOString();

export interface ProgressStore {
  progress: Progress;
  record: (event: ProgressEvent) => void;
  reset: () => void;
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  progress: loadProgress(now()),
  record: (event) => {
    const next = applyProgressEvent(get().progress, event, now());
    saveProgress(next);
    set({ progress: next });
  },
  reset: () => {
    const fresh = emptyProgress(now());
    saveProgress(fresh);
    set({ progress: fresh });
  },
}));
