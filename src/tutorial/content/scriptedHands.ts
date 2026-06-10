import type { Card } from '../../engine/types';
import { Street } from '../../engine/types';
import type { ScriptedHand } from '../types';

const c = (rank: number, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

// Unused board cards for preflop scenarios (kept distinct from all hole cards).
const FILLER_BOARD = [c(3, 'h'), c(4, 'h'), c(5, 'c'), c(6, 's'), c(8, 'd')];

const THREE_SEATS = [
  { id: 0, name: 'You', isHuman: true, stack: 1000 },
  { id: 1, name: 'Ava', isHuman: false, stack: 1000 },
  { id: 2, name: 'Ben', isHuman: false, stack: 1000 },
];

export const SCRIPTED_HANDS: ScriptedHand[] = [
  {
    id: 'practice-fold-trash',
    title: 'Folding a Weak Hand',
    description: 'You are first to act before the flop holding one of the worst starting hands. Learn to let it go.',
    setup: {
      seats: THREE_SEATS,
      buttonSeatId: 0, // 3-handed: button acts first preflop
      smallBlind: 10,
      bigBlind: 20,
      holeCards: {
        0: [c(7, 'd'), c(2, 'c')], // 7-2 offsuit — the worst hand in hold'em
        1: [c(13, 'c'), c(12, 'd')],
        2: [c(14, 'c'), c(9, 'd')],
      },
      board: FILLER_BOARD,
    },
    checkpoints: [
      {
        atStreet: Street.Preflop,
        coachText:
          'You hold 7♦ 2♣ — the weakest starting hand there is. It’s offsuit, unconnected, and low. There is no reward for entering this pot.',
        recommended: 'fold',
        acceptable: ['fold'],
        explainRight: 'Correct — fold. Throwing away trash hands preflop is the single most profitable habit a beginner can build.',
        explainWrong: 'This hand can’t make strong pairs, straights, or flushes easily. Calling or raising here just loses chips over time. Fold it.',
      },
    ],
  },
  {
    id: 'practice-raise-premium',
    title: 'Raising a Premium Hand',
    description: 'You wake up with the best starting hand in poker. Don’t play it passively — raise to build the pot.',
    setup: {
      seats: THREE_SEATS,
      buttonSeatId: 0,
      smallBlind: 10,
      bigBlind: 20,
      holeCards: {
        0: [c(14, 's'), c(14, 'h')], // pocket aces
        1: [c(13, 'c'), c(12, 'd')],
        2: [c(10, 'c'), c(9, 'd')],
      },
      board: FILLER_BOARD,
    },
    checkpoints: [
      {
        atStreet: Street.Preflop,
        coachText:
          'You hold A♠ A♥ — pocket aces, the strongest starting hand. With a premium hand you want to raise: build the pot now while you’re likely ahead.',
        recommended: 'raise',
        acceptable: ['raise', 'allin'],
        explainRight: 'Correct — raise. Strong hands play best in big pots. Just calling lets opponents in cheaply and wastes your edge.',
        explainWrong: 'Folding or just calling with aces is far too passive. Raise to grow the pot while you hold the best hand.',
      },
    ],
  },
];

export const SCRIPTED_HANDS_BY_ID: Record<string, ScriptedHand> = Object.fromEntries(
  SCRIPTED_HANDS.map((h) => [h.id, h]),
);
