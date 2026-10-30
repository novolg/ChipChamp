import { BEST_FIVE_EXERCISES, type BestFiveExercise } from './bestFive';
import { DAILY_EXTRAS } from './dailyExtras';

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayNumber(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? time / 86400000 : NaN;
}

export function cleanDays(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((day): day is string => typeof day === 'string' && Number.isFinite(dayNumber(day))))].sort() : [];
}

export function dailyStats(days: string[], today: string) {
  const numbers = cleanDays(days).map(dayNumber).filter((day) => day <= dayNumber(today));
  let run = 0, best = 0, previous = -Infinity;
  for (const day of numbers) {
    run = day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { completed: previous === dayNumber(today), streak: previous >= dayNumber(today) - 1 ? run : 0, best, total: numbers.length };
}

export const DAILY_EXERCISES: BestFiveExercise[] = [...BEST_FIVE_EXERCISES, ...DAILY_EXTRAS, {
  id: 'wheel', title: 'A small straight, a big detail',
  prompt: 'Choose your strongest five cards. Can the ace help these low cards?',
  hole: [{ rank: 14, suit: 's' }, { rank: 2, suit: 'h' }],
  board: [{ rank: 3, suit: 'c' }, { rank: 4, suit: 'd' }, { rank: 5, suit: 'h' }, { rank: 13, suit: 's' }, { rank: 13, suit: 'd' }],
  hint: 'An ace can play below a two. A straight beats a pair.',
  explanation: 'A–2–3–4–5 is a five-high straight, called a wheel. The pair of kings cannot improve it.',
}, {
  id: 'full-house', title: 'Make room for a full house',
  prompt: 'There are two pairs on the board. Which five give you the strongest hand?',
  hole: [{ rank: 13, suit: 's' }, { rank: 14, suit: 'h' }],
  board: [{ rank: 13, suit: 'c' }, { rank: 13, suit: 'd' }, { rank: 8, suit: 'h' }, { rank: 8, suit: 's' }, { rank: 2, suit: 'd' }],
  hint: 'Keep three kings and a pair. The ace is high, but it does not belong in this full house.',
  explanation: 'Three kings and two eights make kings full of eights. The ace stays out of your best five.',
}];

/** Calendar days, not elapsed hours: daylight-saving changes do not skip puzzles. */
export function dailyExercise(day: string): BestFiveExercise {
  const ordinal = dayNumber(day);
  if (!Number.isFinite(ordinal)) throw new Error('Invalid daily challenge date');
  return DAILY_EXERCISES[((ordinal % DAILY_EXERCISES.length) + DAILY_EXERCISES.length) % DAILY_EXERCISES.length];
}
