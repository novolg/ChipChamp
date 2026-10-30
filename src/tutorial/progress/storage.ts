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
export function loadProgress(now: string, adapter: StorageAdapter | null = defaultAdapter(), unavailableFallback = emptyProgress(now)): Progress {
  if (!adapter) return unavailableFallback;
  try {
    const raw = adapter.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress(now);
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (parsed.version !== 1) return emptyProgress(now);
    const fresh = emptyProgress(now);
    const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length < 256))] : [];
    const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const scores = parsed.quizScores && typeof parsed.quizScores === 'object' ? parsed.quizScores : {};
    return {
      ...fresh,
      completedLessonIds: ids(parsed.completedLessonIds),
      completedScriptedHandIds: ids(parsed.completedScriptedHandIds),
      quizScores: Object.fromEntries(Object.entries(scores).filter(([, score]) => score && typeof score === 'object').map(([id, score]) => [id, {
        best: typeof score.best === 'number' && Number.isFinite(score.best) ? Math.min(1, Math.max(0, score.best)) : 0,
        attempts: count(score.attempts),
      }])),
      freePlayStats: { handsPlayed: count(parsed.freePlayStats?.handsPlayed), netChips: Number.isSafeInteger(parsed.freePlayStats?.netChips) ? parsed.freePlayStats!.netChips : 0 },
      ...(typeof parsed.lastFreePlayHandId === 'string' ? { lastFreePlayHandId: parsed.lastFreePlayHandId } : {}),
      lastUpdated: typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : now,
    };
  } catch {
    return unavailableFallback;
  }
}

/** Persist progress; swallows quota/serialization errors (best-effort). */
export function saveProgress(progress: Progress, adapter: StorageAdapter | null = defaultAdapter()): boolean {
  if (!adapter) return false;
  try {
    adapter.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export { STORAGE_KEY };
