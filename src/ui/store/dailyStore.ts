import { create } from 'zustand';
import { cleanDays, localDay } from '../../tutorial/dailyChallenge';
import { withProgressLock, type SaveResult } from './progressLock';

const KEY = 'chipchamp.daily.v1';
function load(): string[] {
  try { return cleanDays(JSON.parse(localStorage.getItem(KEY) ?? '[]')); }
  catch { return []; }
}
export function resetDailyWithinProgressLock(): boolean {
  let saved = true;
  try { localStorage.removeItem(KEY); } catch { saved = false; }
  useDailyStore.setState({ days: [], saved });
  return saved;
}
export const useDailyStore = create<{ days: string[]; saved: boolean; complete: (day: string) => SaveResult; reset: () => SaveResult }>((set, get) => ({
  days: load(), saved: true,
  reset: () => withProgressLock(resetDailyWithinProgressLock, () => { set({ days: [], saved: false }); return false; }),
  complete: (day) => {
    if (day !== localDay()) return false;
    return withProgressLock(() => {
      // Read only after acquiring the same lock used by curriculum and reset.
      const days = cleanDays([...(get().saved ? [] : get().days), ...load(), day]);
      let saved = true;
      try { localStorage.setItem(KEY, JSON.stringify(days)); } catch { saved = false; }
      set({ days, saved });
      return saved;
    }, () => { set({ days: cleanDays([...get().days, day]), saved: false }); return false; });
  },
}));
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === KEY || event.key === null) useDailyStore.setState({ days: load(), saved: true });
});
