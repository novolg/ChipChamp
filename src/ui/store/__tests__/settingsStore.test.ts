import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const engineMocks = vi.hoisted(() => ({ setBusVolume: vi.fn() }));
vi.mock('../../../audio/engine', () => ({ setBusVolume: engineMocks.setBusVolume }));

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  prefersReducedMotion,
  useSettingsStore,
  type Settings,
} from '../settingsStore';

/** Minimal in-memory Storage fake matching Pick<Storage, 'getItem' | 'setItem'>. */
function fakeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('settingsStore persistence (loadSettings / saveSettings)', () => {
  it('returns defaults when storage is null', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when nothing is stored yet', () => {
    const storage = fakeStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults on corrupt JSON', () => {
    const storage = fakeStorage({ 'cc.settings.v1': '{not valid json' });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults on version mismatch', () => {
    const storage = fakeStorage({
      'cc.settings.v1': JSON.stringify({ version: 999, settings: { haptics: false } }),
    });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when storage.getItem throws (e.g. privacy mode / quota)', () => {
    const storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {},
    };
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('saveSettings swallows a quota-exceeded throw instead of crashing', () => {
    const storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveSettings(DEFAULT_SETTINGS, storage)).not.toThrow();
  });

  it('round-trips a saved settings object', () => {
    const storage = fakeStorage();
    const custom: Settings = {
      volumes: { master: 0.5, sfx: 0.2, ui: 0.9, ambience: 0.1, music: 0.3 },
      speed: 2,
      fourColorDeck: true,
      feltTheme: 'navy',
      renderer: 'reduced',
      reducedMotion: 'on',
      haptics: false,
    };
    saveSettings(custom, storage);
    expect(loadSettings(storage)).toEqual(custom);
  });

  it('ignores unknown stored keys (forward-compat) without leaking them', () => {
    const storage = fakeStorage({
      'cc.settings.v1': JSON.stringify({
        version: 1,
        settings: {
          haptics: false,
          speed: 2,
          futureFeature: 'some-new-thing',
          volumes: { master: 0.4, futureBus: 0.9 },
        },
      }),
    });
    const loaded = loadSettings(storage);
    expect(loaded).toEqual({
      ...DEFAULT_SETTINGS,
      haptics: false,
      speed: 2,
      volumes: { ...DEFAULT_SETTINGS.volumes, master: 0.4 },
    });
    expect(loaded).not.toHaveProperty('futureFeature');
    expect(loaded.volumes).not.toHaveProperty('futureBus');
  });

  it('falls back to defaults for invalid literal/boolean values per field', () => {
    const storage = fakeStorage({
      'cc.settings.v1': JSON.stringify({
        version: 1,
        settings: {
          speed: 5,
          renderer: 'webgl',
          reducedMotion: 'yes',
          feltTheme: 'crimson',
          haptics: 'yes',
          fourColorDeck: 1,
        },
      }),
    });
    const loaded = loadSettings(storage);
    expect(loaded.speed).toBe(1);
    expect(loaded.renderer).toBe('auto');
    expect(loaded.reducedMotion).toBe('system');
    expect(loaded.feltTheme).toBe('navy');
    expect(loaded.haptics).toBe(true);
    expect(loaded.fourColorDeck).toBe(false);
  });

  it('keeps valid non-default literals while rejecting only the invalid ones', () => {
    const storage = fakeStorage({
      'cc.settings.v1': JSON.stringify({
        version: 1,
        settings: { speed: 0.5, renderer: 'dom', reducedMotion: 'banana' },
      }),
    });
    const loaded = loadSettings(storage);
    expect(loaded.speed).toBe(0.5);
    expect(loaded.renderer).toBe('dom');
    expect(loaded.reducedMotion).toBe('system');
  });
});

describe('prefersReducedMotion', () => {
  it('returns true when settings.reducedMotion is "on", without touching matchMedia', () => {
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, reducedMotion: 'on' })).toBe(true);
  });

  it('falls back to false in a node env (no window/matchMedia) when reducedMotion is "system"', () => {
    expect(typeof window).toBe('undefined');
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, reducedMotion: 'system' })).toBe(false);
  });
});

describe('useSettingsStore', () => {
  beforeEach(() => {
    engineMocks.setBusVolume.mockClear();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates from defaults at module init (no storage available in node)', () => {
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('set() updates a top-level key', () => {
    useSettingsStore.getState().set('haptics', false);
    expect(useSettingsStore.getState().settings.haptics).toBe(false);
  });

  it('set() writes through to storage', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);

    useSettingsStore.getState().set('fourColorDeck', true);

    const persisted = JSON.parse(storage.data['cc.settings.v1']);
    expect(persisted.settings.fourColorDeck).toBe(true);
  });

  it('setVolume clamps to [0,1] and calls setBusVolume with the clamped value', () => {
    useSettingsStore.getState().setVolume('music', 1.5);
    expect(useSettingsStore.getState().settings.volumes.music).toBe(1);
    expect(engineMocks.setBusVolume).toHaveBeenCalledWith('music', 1);

    useSettingsStore.getState().setVolume('sfx', -1);
    expect(useSettingsStore.getState().settings.volumes.sfx).toBe(0);
    expect(engineMocks.setBusVolume).toHaveBeenCalledWith('sfx', 0);
  });

  it('setVolume with NaN never persists or forwards NaN (keeps current value)', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);

    useSettingsStore.getState().setVolume('master', NaN);

    expect(useSettingsStore.getState().settings.volumes.master).toBe(1);
    expect(engineMocks.setBusVolume).toHaveBeenCalledWith('master', 1);
    const persisted = JSON.parse(storage.data['cc.settings.v1']);
    expect(persisted.settings.volumes.master).toBe(1);
  });

  it('setVolume writes through to storage', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);

    useSettingsStore.getState().setVolume('master', 0.42);

    const persisted = JSON.parse(storage.data['cc.settings.v1']);
    expect(persisted.settings.volumes.master).toBe(0.42);
  });
});
