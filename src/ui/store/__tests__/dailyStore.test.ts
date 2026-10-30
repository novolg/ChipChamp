import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDay } from '../../../tutorial/dailyChallenge';

const KEY = 'chipchamp.daily.v1';
describe('daily result persistence', () => {
  let data: Record<string, string>;
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, write: () => boolean) => write() } });
    data = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => { data[key] = value; },
      removeItem: (key: string) => { delete data[key]; },
    });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('recovers from malformed storage', async () => {
    data[KEY] = '{broken';
    const { useDailyStore } = await import('../dailyStore');
    expect(useDailyStore.getState().days).toEqual([]);
    await useDailyStore.getState().complete(localDay());
    expect(JSON.parse(data[KEY])).toEqual([localDay()]);
  });
  it('ignores stale submissions and counts replay only once', async () => {
    const { useDailyStore } = await import('../dailyStore');
    await useDailyStore.getState().complete('2000-01-01');
    expect(useDailyStore.getState().days).toEqual([]);
    await useDailyStore.getState().complete(localDay());
    await useDailyStore.getState().complete(localDay());
    expect(useDailyStore.getState().days).toEqual([localDay()]);
  });
  it('retains session progress when storage is unavailable', async () => {
    localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    const { useDailyStore } = await import('../dailyStore');
    await useDailyStore.getState().complete(localDay());
    expect(useDailyStore.getState().days).toEqual([localDay()]);
    expect(useDailyStore.getState().saved).toBe(false);
  });
  it('merges other-tab progress and clears it on reset', async () => {
    const { useDailyStore } = await import('../dailyStore');
    data[KEY] = JSON.stringify(['2000-01-01']);
    await useDailyStore.getState().complete(localDay());
    expect(useDailyStore.getState().days).toEqual(['2000-01-01', localDay()]);
    await useDailyStore.getState().reset();
    expect(useDailyStore.getState().days).toEqual([]);
    expect(data[KEY]).toBeUndefined();
  });
  it('does not revive old days after another tab resets before its storage event arrives', async () => {
    data[KEY] = JSON.stringify(['2000-01-01']);
    const { useDailyStore } = await import('../dailyStore');
    delete data[KEY];
    await useDailyStore.getState().complete(localDay());
    expect(useDailyStore.getState().days).toEqual([localDay()]);
  });
});
