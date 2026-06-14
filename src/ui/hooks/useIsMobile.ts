import { useEffect, useState } from 'react';

/** Width breakpoint below which the app uses the fluid mobile layout.
 *  Mirrors the `@media (max-width: 760px)` blocks in table.css / screens.css. */
export const MOBILE_QUERY = '(max-width: 760px)';

/**
 * True when the viewport is at or below the mobile breakpoint. Subscribes to
 * matchMedia changes (resize / device-rotate) and re-renders. SSR-safe guard:
 * returns false when `matchMedia` is unavailable.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches); // sync in case it changed before effect ran
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
