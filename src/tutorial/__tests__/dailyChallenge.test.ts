import { describe, expect, it } from 'vitest';
import { cleanDays, dailyExercise, dailyStats, localDay, DAILY_EXERCISES } from '../dailyChallenge';
import { assessBestFive } from '../bestFive';

describe('daily challenge calendar and progress', () => {
  it('formats the local calendar date', () => {
    expect(localDay(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
  it('rejects malformed, impossible and non-string stored dates', () => {
    expect(cleanDays(['2026-02-30', '2024-02-29', null, 'bad', '2024-02-29', 2])).toEqual(['2024-02-29']);
    expect(cleanDays({ days: [] })).toEqual([]);
  });
  it('counts a completed date once and keeps yesterday’s streak alive', () => {
    expect(dailyStats(['2026-12-31', '2027-01-01', '2027-01-01'], '2027-01-02')).toEqual({ completed: false, streak: 2, best: 2, total: 2 });
  });
  it('resets active streak after a gap while retaining the personal best', () => {
    expect(dailyStats(['2026-10-01', '2026-10-02', '2026-10-05'], '2026-10-05')).toEqual({ completed: true, streak: 1, best: 2, total: 3 });
    expect(dailyStats(['2026-10-01'], '2026-10-05').streak).toBe(0);
  });
  it('counts consecutive calendar days across leap days and daylight saving', () => {
    expect(dailyStats(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01').streak).toBe(3);
    expect(dailyStats(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26').streak).toBe(3);
  });
  it('does not count future dates', () => {
    expect(dailyStats(['2027-01-01'], '2026-10-21')).toEqual({ completed: false, streak: 0, best: 0, total: 0 });
  });
  it('returns the same puzzle for the same date and rotates daily', () => {
    expect(dailyExercise('2026-10-21')).toBe(dailyExercise('2026-10-21'));
    expect(dailyExercise('2026-10-21').id).not.toBe(dailyExercise('2026-10-22').id);
    expect(() => dailyExercise('2026-02-30')).toThrow();
  });
  it('offers solvable seven-card puzzles with both correct and incorrect selections', () => {
    const ids = new Set<string>();
    for (let day = 20; day < 20 + DAILY_EXERCISES.length; day++) {
      const exercise = dailyExercise(`2026-10-${day}`);
      ids.add(exercise.id);
      expect(new Set([...exercise.hole, ...exercise.board].map((c) => `${c.rank}${c.suit}`)).size).toBe(7);
      const answers = [];
      for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        answers.push(assessBestFive(exercise, [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== a && i !== b))?.correct);
      }
      expect(answers).toContain(true);
      expect(answers).toContain(false);
    }
    expect(ids.size).toBe(12);
  });
});
