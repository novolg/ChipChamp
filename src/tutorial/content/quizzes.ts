import type { Quiz } from '../types';

export const QUIZZES: Quiz[] = [
  {
    id: 'quiz-rankings',
    title: 'Hand Rankings Quiz',
    passThreshold: 0.66,
    questions: [
      {
        id: 'q1',
        prompt: 'Which hand is stronger: a flush or a straight?',
        options: [
          { id: 'a', label: 'Flush' },
          { id: 'b', label: 'Straight' },
          { id: 'c', label: 'They are equal' },
        ],
        correctOptionId: 'a',
        explanation: 'A flush (five cards of one suit) beats a straight (five in sequence).',
      },
      {
        id: 'q2',
        prompt: 'You hold A♠ A♦. The board is K♣ K♥ 7♦ 2♣ 5♠. What is your best hand?',
        options: [
          { id: 'a', label: 'Two pair (aces and kings)' },
          { id: 'b', label: 'Three of a kind' },
          { id: 'c', label: 'Full house' },
        ],
        correctOptionId: 'a',
        explanation: 'Your two aces plus the two kings on the board make two pair, aces and kings.',
      },
      {
        id: 'q3',
        prompt: 'Which five cards make the lowest possible straight?',
        options: [
          { id: 'a', label: 'A-2-3-4-5' },
          { id: 'b', label: '2-3-4-5-6' },
          { id: 'c', label: '10-J-Q-K-A' },
        ],
        correctOptionId: 'a',
        explanation: 'A-2-3-4-5 (the “wheel”) is the lowest straight; the ace plays low here.',
      },
    ],
  },
  {
    id: 'quiz-odds',
    title: 'Pot Odds Quiz',
    passThreshold: 0.5,
    questions: [
      {
        id: 'q1',
        prompt: 'The pot is $90 and it costs you $30 to call. What pot odds are you getting?',
        options: [
          { id: 'a', label: 'You need ~25% equity to call' },
          { id: 'b', label: 'You need ~50% equity to call' },
          { id: 'c', label: 'You need ~33% equity to call' },
        ],
        correctOptionId: 'a',
        explanation: '30 to call into a final pot of 120 → 30/120 = 25%.',
      },
      {
        id: 'q2',
        prompt: 'You have a flush draw (9 outs) on the flop. Roughly what is your chance to hit by the river?',
        options: [
          { id: 'a', label: '~18%' },
          { id: 'b', label: '~36%' },
          { id: 'c', label: '~50%' },
        ],
        correctOptionId: 'b',
        explanation: 'Rule of 4 on the flop: 9 outs × 4 ≈ 36%.',
      },
    ],
  },
];

export const QUIZZES_BY_ID: Record<string, Quiz> = Object.fromEntries(
  QUIZZES.map((q) => [q.id, q]),
);
