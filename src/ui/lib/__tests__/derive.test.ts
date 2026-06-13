import { describe, it, expect } from 'vitest';
import { createTable } from '../../../engine/reducer';
import { canDealNextHand, heroIsBusted } from '../derive';

/** Build a hand-complete table with the given stacks (seat 0 is the human). */
const tableWith = (stacks: number[]) =>
  createTable({
    seats: stacks.map((stack, i) => ({
      id: i,
      name: i === 0 ? 'You' : `Bot${i}`,
      isHuman: i === 0,
      stack,
    })),
    buttonSeatId: 0,
    smallBlind: 10,
    bigBlind: 20,
    seed: 1,
  });

describe('canDealNextHand', () => {
  it('allows dealing when the hero and at least one bot have chips', () => {
    expect(canDealNextHand(tableWith([1000, 1000, 1000, 1000]))).toBe(true);
    expect(canDealNextHand(tableWith([1000, 1000, 0, 0]))).toBe(true);
  });

  it('refuses when the hero is busted, even if two bots could keep playing', () => {
    // Regression: the hero must not be dealt into a hand with 0 chips (it would
    // be seated "out" with no hole cards → placeholder cards on the felt).
    expect(canDealNextHand(tableWith([0, 1000, 1000, 0]))).toBe(false);
  });

  it('refuses when only the hero has chips left', () => {
    expect(canDealNextHand(tableWith([1000, 0, 0, 0]))).toBe(false);
  });
});

describe('heroIsBusted', () => {
  it('is true only when the human seat has no chips', () => {
    expect(heroIsBusted(tableWith([0, 1000, 1000, 0]))).toBe(true);
    expect(heroIsBusted(tableWith([1000, 1000, 1000, 1000]))).toBe(false);
  });
});
