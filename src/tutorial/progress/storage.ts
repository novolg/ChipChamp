import type { Progress } from '../types';
import { emptyProgress } from './progressReducer';

const STORAGE_KEY = 'pokergame.progress.v1';

/** Minimal storage interface so tests can inject an in-memory adapter. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultAdapter(): StorageAdapter | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Accessing localStorage can throw in some privacy modes.
  }
  return null;
}

/** Load progress, falling back to a fresh record on any error or version mismatch. */
export function loadProgress(now: string, adapter: StorageAdapter | null = defaultAdapter()): Progress {
  if (!adapter) return emptyProgress(now);
  try {
    const raw = adapter.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress(now);
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (parsed.version !== 1) return emptyProgress(now);
    // Merge over a fresh record so missing fields are filled in.
    return { ...emptyProgress(now), ...parsed, version: 1 } as Progress;
  } catch {
    return emptyProgress(now);
  }
}

/** Persist progress; swallows quota/serialization errors (best-effort). */
export function saveProgress(progress: Progress, adapter: StorageAdapter | null = defaultAdapter()): void {
  if (!adapter) return;
  try {
    adapter.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore quota or serialization failures — progress is non-critical.
  }
}

export { STORAGE_KEY };
