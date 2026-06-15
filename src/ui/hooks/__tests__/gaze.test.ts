import { describe, it, expect } from 'vitest';
import { createTable, startHand, applyAction, type TableConfig } from '../../../engine/reducer';
import type { Action } from '../../../engine/types';
import { gazeVector, pickAmbientTarget, detectBigMoment } from '../useGazeDirector';

const NAMES = ['You', 'Ava', 'Ben', 'Cleo'];
const table = (stacks: number[], button = 0): TableConfig => ({
  seats: stacks.map((stack, i) => ({ id: i, name: NAMES[i], isHuman: i === 0, stack })),
  buttonSeatId: button,
  smallBlind: 10,
  bigBlind: 20,
  seed: 12345,
});
const act = (type: Action['type'], seatId: number, amount?: number): Action => ({ type, seatId, amount });

describe('gazeVector', () => {
  it('forward is the zero vector', () => {
    expect(gazeVector('center', 'forward')).toEqual({ x: 0, y: 0, tilt: 0 });
    expect(gazeVector('left', 'forward')).toEqual({ x: 0, y: 0, tilt: 0 });
  });

  it('looking at self resolves to forward (zero)', () => {
    expect(gazeVector('left', 'left')).toEqual({ x: 0, y: 0, tilt: 0 });
    expect(gazeVector('right', 'right')).toEqual({ x: 0, y: 0, tilt: 0 });
  });

  it('left and right slots are horizontal mirrors looking center', () => {
    const l = gazeVector('left', 'center');
    const r = gazeVector('right', 'center');
    expect(l.x).toBeCloseTo(-r.x);
    expect(l.tilt).toBeCloseTo(-r.tilt);
  });

  it('looking at hero/pot pulls the eyes downward (positive y)', () => {
    expect(gazeVector('center', 'hero').y).toBeGreaterThan(0);
    expect(gazeVector('left', 'pot').y).toBeGreaterThan(0);
  });

  it('stays within the taste budget (|x|,|y| ≤ 2.5px, |tilt| ≤ 2.5°)', () => {
    const slots = ['left', 'center', 'right'] as const;
    const targets = ['forward', 'left', 'center', 'right', 'hero', 'pot'] as const;
    for (const s of slots) for (const t of targets) {
      const v = gazeVector(s, t);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(v.tilt)).toBeLessThanOrEqual(2.5);
    }
  });
});

describe('pickAmbientTarget', () => {
  it('returns a peer for low rand, forward otherwise', () => {
    expect(pickAmbientTarget('center', ['left', 'right'], 0.0)).toBe('left');
    expect(pickAmbientTarget('center', ['left', 'right'], 0.39)).toBe('right');
    expect(pickAmbientTarget('center', ['left', 'right'], 0.6)).toBe('forward');
  });

  it('returns forward when there are no peers', () => {
    expect(pickAmbientTarget('center', [], 0.0)).toBe('forward');
  });
});

describe('detectBigMoment', () => {
  it('null when prev is null', () => {
    const s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    expect(detectBigMoment(null, s)).toBe(null);
  });

  it('fires on a fresh all-in, naming the shover', () => {
    const prev = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    const shover = prev.toActSeatId!;
    const next = applyAction(prev, act('allin', shover));
    expect(detectBigMoment(prev, next)).toEqual({ seatId: shover });
  });

  it('null on a non-aggressive action (a fold)', () => {
    const prev = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    const next = applyAction(prev, act('fold', prev.toActSeatId!));
    expect(detectBigMoment(prev, next)).toBe(null);
  });

  it('fires on a bet ≥ 0.75× the pot it bets into', () => {
    // limp to flop: pot = 4×20 = 80, potBefore on flop = 80, threshold = 60
    let s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    while (s.board.length < 3) {
      const id = s.toActSeatId!;
      const owe = s.currentBet - s.seats.find((x) => x.id === id)!.committedThisStreet;
      s = applyAction(s, owe > 0 ? act('call', id) : act('check', id));
    }
    // potBefore = 80; bet 60 = exactly 0.75× pot → should fire
    const bettor = s.toActSeatId!;
    const next = applyAction(s, act('bet', bettor, 60));
    expect(detectBigMoment(s, next)).toEqual({ seatId: bettor });
  });

  it('null on a small bet (< 0.75× pot)', () => {
    // same flop setup: potBefore = 80, threshold = 60
    let s = startHand(createTable(table([1000, 1000, 1000, 1000], 0)));
    while (s.board.length < 3) {
      const id = s.toActSeatId!;
      const owe = s.currentBet - s.seats.find((x) => x.id === id)!.committedThisStreet;
      s = applyAction(s, owe > 0 ? act('call', id) : act('check', id));
    }
    // potBefore = 80; bet 20 = min legal bet, well below 0.75×80=60 → should not fire
    const bettor = s.toActSeatId!;
    const next = applyAction(s, act('bet', bettor, 20));
    expect(detectBigMoment(s, next)).toBe(null);
  });
});
