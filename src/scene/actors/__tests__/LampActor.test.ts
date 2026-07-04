import { describe, it, expect } from 'vitest';
import { lampRest, breatheAlpha, LAMP_ALPHA_MIN, LAMP_ALPHA_MAX } from '../LampActor';
import { tableLayout } from '../../layout';
import { damp, focusTarget, swayOffset, LAMP_SWAY_AMP } from '../LampActor';

describe('lampRest', () => {
  it('sits horizontally centered and above the felt center', () => {
    const L = tableLayout('landscape');
    const rest = lampRest(L);
    expect(rest.x).toBe(L.felt.cx);
    expect(rest.y).toBeLessThan(L.felt.cy); // "from above"
  });
});

describe('breatheAlpha', () => {
  it('stays within the breathing band for any elapsed time', () => {
    for (const t of [0, 1000, 4000, 8000, 15234]) {
      const a = breatheAlpha(t);
      expect(a).toBeGreaterThanOrEqual(LAMP_ALPHA_MIN - 1e-9);
      expect(a).toBeLessThanOrEqual(LAMP_ALPHA_MAX + 1e-9);
    }
  });
});

describe('damp', () => {
  it('halves the remaining gap after one half-life', () => {
    const out = damp(0, 100, 200, 200); // dt == halfLife
    expect(out).toBeCloseTo(50, 5);
  });
  it('is frame-rate independent (two half-steps == one full step)', () => {
    const one = damp(0, 100, 200, 200);
    const two = damp(damp(0, 100, 100, 200), 100, 100, 200);
    expect(two).toBeCloseTo(one, 5);
  });
});

describe('focusTarget', () => {
  const rest = { x: 100, y: 100 };
  const seat = { x: 300, y: 40 };
  it('returns rest at pull 0', () => {
    expect(focusTarget(rest, seat, 0)).toEqual(rest);
  });
  it('returns the target at pull 1', () => {
    expect(focusTarget(rest, seat, 1)).toEqual(seat);
  });
  it('interpolates a fraction of the way at pull 0.4', () => {
    const p = focusTarget(rest, seat, 0.4);
    expect(p.x).toBeCloseTo(180, 5);
    expect(p.y).toBeCloseTo(76, 5);
  });
});

describe('swayOffset', () => {
  it('is zero at t=0 and bounded by the amplitude', () => {
    expect(swayOffset(0)).toBeCloseTo(0, 5);
    for (const t of [500, 1500, 3000, 6000, 9999]) {
      expect(Math.abs(swayOffset(t))).toBeLessThanOrEqual(LAMP_SWAY_AMP + 1e-9);
    }
  });
});
