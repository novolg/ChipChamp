import { create } from 'zustand';
import { setBusVolume } from '../../audio/engine';

export interface Settings {
  volumes: { master: number; sfx: number; ui: number; ambience: number; music: number }; // 0..1
  speed: 0.5 | 1 | 2;
  fourColorDeck: boolean;
  feltTheme: 'navy';
  renderer: 'auto' | 'full' | 'reduced' | 'dom';
  reducedMotion: 'system' | 'on';
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  volumes: { master: 1, sfx: 1, ui: 1, ambience: 0.8, music: 0.8 },
  speed: 1,
  fourColorDeck: false,
  feltTheme: 'navy',
  renderer: 'auto',
  reducedMotion: 'system',
  haptics: true,
};

const STORAGE_KEY = 'cc.settings.v1';
const STORAGE_VERSION = 1;

interface StoredPayload {
  version: number;
  settings: Partial<Settings> & { volumes?: Partial<Settings['volumes']> };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Accessing localStorage can throw in some privacy modes.
  }
  return null;
}

function clampVolume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Merge stored settings over the defaults, picking only known fields (forward-compat). */
function sanitize(raw: StoredPayload['settings'] | undefined): Settings {
  const s: StoredPayload['settings'] = raw ?? {};
  const v: Partial<Settings['volumes']> = s.volumes ?? {};
  return {
    volumes: {
      master: clampVolume(v.master, DEFAULT_SETTINGS.volumes.master),
      sfx: clampVolume(v.sfx, DEFAULT_SETTINGS.volumes.sfx),
      ui: clampVolume(v.ui, DEFAULT_SETTINGS.volumes.ui),
      ambience: clampVolume(v.ambience, DEFAULT_SETTINGS.volumes.ambience),
      music: clampVolume(v.music, DEFAULT_SETTINGS.volumes.music),
    },
    speed: s.speed ?? DEFAULT_SETTINGS.speed,
    fourColorDeck: s.fourColorDeck ?? DEFAULT_SETTINGS.fourColorDeck,
    feltTheme: DEFAULT_SETTINGS.feltTheme,
    renderer: s.renderer ?? DEFAULT_SETTINGS.renderer,
    reducedMotion: s.reducedMotion ?? DEFAULT_SETTINGS.reducedMotion,
    haptics: s.haptics ?? DEFAULT_SETTINGS.haptics,
  };
}

/** Load settings, falling back to defaults on any error, version mismatch, or missing data. */
export function loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<StoredPayload>;
    if (parsed.version !== STORAGE_VERSION) return DEFAULT_SETTINGS;
    return sanitize(parsed.settings);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Persist settings; swallows quota/serialization errors (best-effort, non-critical). */
export function saveSettings(settings: Settings, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    const payload: StoredPayload = { version: STORAGE_VERSION, settings };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota or serialization failures — settings are non-critical.
  }
}

/** True if motion should be reduced: explicit user override, or the OS-level media query. */
export function prefersReducedMotion(s: Settings): boolean {
  if (s.reducedMotion === 'on') return true;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface SettingsStore {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setVolume: (bus: keyof Settings['volumes'], v: number) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: loadSettings(),
  set: (key, value) => {
    const next = { ...get().settings, [key]: value };
    saveSettings(next);
    set({ settings: next });
  },
  setVolume: (bus, v) => {
    const clamped = Math.min(1, Math.max(0, v));
    const next: Settings = {
      ...get().settings,
      volumes: { ...get().settings.volumes, [bus]: clamped },
    };
    saveSettings(next);
    set({ settings: next });
    setBusVolume(bus, clamped);
  },
}));
