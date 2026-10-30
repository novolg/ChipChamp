import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/** One writer per origin. Browser locks release automatically on tab closure. */
export function useTableOwnership() {
  useEffect(() => {
    if (!navigator.locks) return;
    const abort = new AbortController();
    let release: (() => void) | undefined;
    let stopped = false;
    useGameStore.getState().setTableControl(false);
    void navigator.locks.request('chipchamp-table', { signal: abort.signal }, async () => {
      if (stopped) return;
      useGameStore.getState().setTableControl(true);
      await new Promise<void>((resolve) => { release = resolve; });
    }).catch((error: unknown) => {
      if (!stopped) console.warn('[table] Unable to acquire browser session lock', error);
    });
    return () => {
      stopped = true;
      abort.abort();
      release?.();
      useGameStore.getState().setTableControl(false);
    };
  }, []);
}
