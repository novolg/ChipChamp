import { useSyncExternalStore } from 'react';
import { isMuted, playSfx, subscribeMuted, toggleMuted, type SfxName } from '../lib/sound';

/** React access to the SFX engine: a stable play fn + reactive muted state. */
export function useSound(): {
  play: (name: SfxName) => void;
  muted: boolean;
  toggle: () => void;
} {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, isMuted);
  return { play: playSfx, muted, toggle: toggleMuted };
}
