import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isReady, subscribe, markReady, __resetReadyStateForTests } from '../readyState';

describe('readyState', () => {
  beforeEach(() => {
    __resetReadyStateForTests();
  });

  it('starts not ready', () => {
    expect(isReady()).toBe(false);
  });

  it('markReady flips the snapshot and notifies subscribers', () => {
    const cb = vi.fn();
    subscribe(cb);
    markReady();
    expect(isReady()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('markReady is idempotent — a second call does not re-notify', () => {
    const cb = vi.fn();
    subscribe(cb);
    markReady();
    markReady();
    expect(isReady()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further notifications', () => {
    const cb = vi.fn();
    const unsubscribe = subscribe(cb);
    unsubscribe();
    markReady();
    expect(cb).not.toHaveBeenCalled();
  });

  it('supports multiple independent subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe(a);
    subscribe(b);
    markReady();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
