import { describe, expect, it } from 'vitest';
import { BEST_FIVE_EXERCISES, assessBestFive, type BestFiveExercise } from '../bestFive';
import { HandCategory } from '../../engine/evaluator';

describe('best-five learning exercises', () => {
  it('requires the low suited card to complete the flush', () => {
    expect(assessBestFive(BEST_FIVE_EXERCISES[0], [0, 1, 2, 3, 4])?.correct).toBe(true);
    expect(assessBestFive(BEST_FIVE_EXERCISES[0], [0, 1, 2, 3, 5])?.correct).toBe(false);
  });
  it('rejects weaker kickers even when the pair is correct', () => {
    const wrong = assessBestFive(BEST_FIVE_EXERCISES[1], [0, 2, 3, 4, 5]);
    expect(wrong?.selected.category).toBe(HandCategory.Pair);
    expect(wrong?.correct).toBe(false);
    expect(assessBestFive(BEST_FIVE_EXERCISES[1], [0, 1, 2, 3, 4])?.correct).toBe(true);
  });
  it('accepts playing all five board cards without private cards', () => {
    expect(assessBestFive(BEST_FIVE_EXERCISES[2], [2, 3, 4, 5, 6])?.correct).toBe(true);
    expect(assessBestFive(BEST_FIVE_EXERCISES[2], [0, 3, 4, 5, 6])?.correct).toBe(false);
  });
  it('accepts equally ranked alternatives regardless of suit', () => {
    const exercise: BestFiveExercise = {
      ...BEST_FIVE_EXERCISES[0],
      hole: [{ rank: 13, suit: 'c' }, { rank: 13, suit: 'd' }],
      board: [{ rank: 14, suit: 's' }, { rank: 14, suit: 'h' }, { rank: 14, suit: 'c' }, { rank: 14, suit: 'd' }, { rank: 2, suit: 's' }],
    };
    expect(assessBestFive(exercise, [0, 2, 3, 4, 5])?.correct).toBe(true);
    expect(assessBestFive(exercise, [1, 2, 3, 4, 5])?.correct).toBe(true);
  });
  it.each([[0, 1], [0, 1, 2, 3, 3], [0, 1, 2, 3, 7], [0, 1, 2, 3, -1], [0, 1, 2, 3, 1.5]])('rejects invalid selection %j', (...indices) => {
    expect(assessBestFive(BEST_FIVE_EXERCISES[0], indices)).toBeNull();
  });
  it('ships seven unique cards in each exercise', () => {
    for (const exercise of BEST_FIVE_EXERCISES) {
      expect(new Set([...exercise.hole, ...exercise.board].map((c) => `${c.rank}${c.suit}`)).size).toBe(7);
    }
  });
});
