import { describe, expect, it } from 'vitest';
import { framingFor, damp, type CamState } from '../camera';
import { tableLayout, BOT_SLOTS } from '../layout';

const modes = ['landscape', 'portrait'] as const;
const ALL_SLOTS = [...BOT_SLOTS, 'hero'] as const;

const dist = (a: CamState, b: CamState): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.zoom - b.zoom);

describe('framingFor', () => {
  it.each(modes)('%s: default is the identity framing', (mode) => {
    expect(framingFor('default', tableLayout(mode))).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it.each(modes)('%s: seat framings zoom 1.03 and follow 0.35×(center − seatCards)', (mode) => {
    const L = tableLayout(mode);
    for (const slot of ALL_SLOTS) {
      const f = framingFor(`seat:${slot}`, L);
      expect(f.zoom).toBe(1.03);
      expect(f.x).toBeCloseTo(0.35 * (L.felt.cx - L.seatCards[slot].x), 10);
      expect(f.y).toBeCloseTo(0.35 * (L.felt.cy - L.seatCards[slot].y), 10);
    }
  });

  it.each(modes)('%s: seat framings point toward the seat (sign checks)', (mode) => {
    const L = tableLayout(mode);
    // Left seat is left of center → world shifts right (x > 0) to bring it in.
    expect(framingFor('seat:left', L).x).toBeGreaterThan(0);
    // Right seat is right of center → world shifts left.
    expect(framingFor('seat:right', L).x).toBeLessThan(0);
    // All three bot seats sit above the felt center → world shifts down.
    for (const slot of BOT_SLOTS) expect(framingFor(`seat:${slot}`, L).y).toBeGreaterThan(0);
    // Hero sits below the felt center → world shifts up.
    expect(framingFor('seat:hero', L).y).toBeLessThan(0);
  });

  it.each(modes)('%s: pot framing zooms 1.02 toward the pot', (mode) => {
    const L = tableLayout(mode);
    const f = framingFor('pot', L);
    expect(f.zoom).toBe(1.02);
    expect(f.x).toBeCloseTo(0.35 * (L.felt.cx - L.pot.x), 10);
    expect(f.y).toBeCloseTo(0.35 * (L.felt.cy - L.pot.y), 10);
    // Pot sits above the felt center in both layouts → world shifts down.
    expect(f.y).toBeGreaterThan(0);
  });
});

describe('damp', () => {
  const from: CamState = { x: 0, y: 0, zoom: 1 };
  const to: CamState = { x: 120, y: -70, zoom: 1.03 };

  it('dt=0 leaves the state unchanged', () => {
    expect(damp(from, to, 0)).toEqual(from);
  });

  it('a target already reached stays fixed', () => {
    expect(damp(to, to, 16)).toEqual(to);
  });

  it('one step of dt = halfLife closes exactly half the gap (every component)', () => {
    const half = damp(from, to, 200, 200);
    expect(half.x).toBeCloseTo(to.x / 2, 10);
    expect(half.y).toBeCloseTo(to.y / 2, 10);
    expect(half.zoom).toBeCloseTo(1 + (to.zoom - 1) / 2, 10);
  });

  it('defaults to a 180ms half-life', () => {
    const explicit = damp(from, to, 180, 180);
    const defaulted = damp(from, to, 180);
    expect(defaulted).toEqual(explicit);
  });

  it('converges monotonically toward the target', () => {
    let s = from;
    let prev = dist(s, to);
    for (let i = 0; i < 200; i++) {
      s = damp(s, to, 16);
      const d = dist(s, to);
      expect(d).toBeLessThan(prev); // strictly closer every step
      prev = d;
    }
    expect(prev).toBeLessThan(1e-3); // and effectively arrived after ~3.2s
  });

  it('never overshoots the target', () => {
    let s = from;
    for (let i = 0; i < 200; i++) {
      s = damp(s, to, 16);
      expect(s.x).toBeLessThanOrEqual(to.x);
      expect(s.y).toBeGreaterThanOrEqual(to.y);
      expect(s.zoom).toBeLessThanOrEqual(to.zoom);
    }
  });

  it('is frame-rate independent: two 8ms steps ≈ one 16ms step (within 1e-3)', () => {
    const twoSmall = damp(damp(from, to, 8), to, 8);
    const oneBig = damp(from, to, 16);
    expect(Math.abs(twoSmall.x - oneBig.x)).toBeLessThan(1e-3);
    expect(Math.abs(twoSmall.y - oneBig.y)).toBeLessThan(1e-3);
    expect(Math.abs(twoSmall.zoom - oneBig.zoom)).toBeLessThan(1e-3);
  });

  it('stays frame-rate independent across a long mixed-step run', () => {
    // 900ms as 60 × 15ms vs 150 × 6ms — same wall time, same destination.
    let a = from;
    for (let i = 0; i < 60; i++) a = damp(a, to, 15);
    let b = from;
    for (let i = 0; i < 150; i++) b = damp(b, to, 6);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-3);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-3);
    expect(Math.abs(a.zoom - b.zoom)).toBeLessThan(1e-3);
  });
});
