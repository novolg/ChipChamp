import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '../store/settingsStore';

const query = '(prefers-reduced-motion: reduce)';
function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
function snapshot() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);
}

/** App override and live OS preference share one policy across rendering paths. */
export function useReducedMotion(): boolean {
  const preference = useSettingsStore((s) => s.settings.reducedMotion);
  const system = useSyncExternalStore(subscribe, snapshot, () => false);
  return preference === 'on' || system;
}
