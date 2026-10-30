import type { Card } from '../engine/types';
import { compareHandRank, evaluateBest, score5 } from '../engine/evaluator';

export interface BestFiveExercise {
  id: string;
  title: string;
  prompt: string;
  hole: Card[];
  board: Card[];
  hint: string;
  explanation: string;
}
const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

export const BEST_FIVE_EXERCISES: BestFiveExercise[] = [
  {
    id: 'flush', title: 'Find the flush',
    prompt: 'Pick exactly five cards to make your strongest hand. You can use zero, one or both of your private cards.',
    hole: [card(14, 's'), card(9, 's')],
    board: [card(13, 's'), card(11, 's'), card(4, 's'), card(12, 'h'), card(2, 'd')],
    hint: 'Look for five cards of the same suit. A low spade can be more useful than a high heart.',
    explanation: 'A♠ K♠ J♠ 9♠ 4♠ make an ace-high flush. Keep the four of spades: the queen of hearts is higher, but it breaks the flush.',
  },
  {
    id: 'kicker', title: 'Keep the best kickers',
    prompt: 'You have a pair of aces. Choose the three other cards that make this pair as strong as possible.',
    hole: [card(14, 's'), card(12, 'd')],
    board: [card(14, 'h'), card(9, 'c'), card(7, 'd'), card(4, 's'), card(2, 'c')],
    hint: 'Keep both aces, then take the three highest remaining cards. Those side cards are called kickers.',
    explanation: 'A♠ A♥ Q♦ 9♣ 7♦ is your best five. If an opponent also has a pair of aces, compare kickers in order: queen, then nine, then seven. Suits do not break a tie.',
  },
  {
    id: 'board', title: 'Sometimes the board plays',
    prompt: 'Do you need either of your private cards? Find the strongest five, even if they are all on the table.',
    hole: [card(2, 'c'), card(3, 'd')],
    board: [card(10, 's'), card(11, 'h'), card(12, 'c'), card(13, 'd'), card(14, 'h')],
    hint: 'The five community cards already make a straight from ten to ace. Your two low cards cannot improve it.',
    explanation: 'T♠ J♥ Q♣ K♦ A♥ is an ace-high straight. You use neither private card. On this board nobody can improve the straight or make a flush, so everyone still in the hand shares the pot.',
  },
];

/** Compare ranks rather than card identity: equally strong selections both count. */
export function assessBestFive(exercise: BestFiveExercise, indices: number[]) {
  const cards = [...exercise.hole, ...exercise.board];
  if (indices.length !== 5 || new Set(indices).size !== 5 ||
      indices.some((i) => !Number.isInteger(i) || i < 0 || i >= cards.length)) return null;
  const selected = score5(indices.map((i) => cards[i]));
  const best = evaluateBest(cards);
  return { selected, best, correct: compareHandRank(selected, best) === 0 };
}
