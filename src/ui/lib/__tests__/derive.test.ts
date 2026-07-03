import { describe, it, expect } from 'vitest';
import { createTable } from '../../../engine/reducer';
import { emptyProgress } from '../../../tutorial/progress/progressReducer';
import { LEARNING_PATH } from '../../../tutorial/content/learningPath';
import { canDealNextHand, heroIsBusted, completedStepCount, learnerLevel, heroChipBalance } from '../derive';

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

describe('completedStepCount / learnerLevel', () => {
  it('is 0 / 1 for fresh progress (no steps complete)', () => {
    const progress = emptyProgress('2026-01-01T00:00:00.000Z');
    expect(completedStepCount(progress)).toBe(0);
    expect(learnerLevel(progress)).toBe(1);
  });

  it('counts completed steps and levels one higher, matching the felt hero badge', () => {
    const progress = {
      ...emptyProgress('2026-01-01T00:00:00.000Z'),
      completedLessonIds: ['rules-basics', 'hand-rankings'],
    };
    // Two lesson steps in LEARNING_PATH ('step-rules', 'step-rankings') are
    // satisfied by those two ids; the quiz/practice steps after them are not.
    expect(completedStepCount(progress)).toBe(2);
    expect(learnerLevel(progress)).toBe(3);
  });

  it('caps at the full path length when every step is complete', () => {
    const progress = {
      ...emptyProgress('2026-01-01T00:00:00.000Z'),
      completedLessonIds: ['rules-basics', 'hand-rankings', 'positions', 'pot-odds'],
      quizScores: { 'quiz-rankings': { best: 1, attempts: 1 }, 'quiz-odds': { best: 1, attempts: 1 } },
      completedScriptedHandIds: ['practice-fold-trash', 'practice-raise-premium'],
      freePlayStats: { handsPlayed: 5, netChips: 0 },
    };
    expect(completedStepCount(progress)).toBe(LEARNING_PATH.length);
    expect(learnerLevel(progress)).toBe(LEARNING_PATH.length + 1);
  });
});

describe('heroChipBalance', () => {
  it('returns the starting stack before the first deal (game === null)', () => {
    expect(heroChipBalance(null, 1000)).toBe(1000);
  });

  it("returns the hero's live stack once a game exists", () => {
    expect(heroChipBalance(tableWith([740, 1000, 1000, 1260]), 1000)).toBe(740);
  });
});
