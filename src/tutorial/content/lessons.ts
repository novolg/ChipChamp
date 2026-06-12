import type { Card } from '../../engine/types';
import type { Lesson } from '../types';

const c = (rank: number, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

export const LESSONS: Lesson[] = [
  {
    id: 'rules-basics',
    title: 'How a Hand Works',
    category: 'rules',
    estMinutes: 4,
    blocks: [
      {
        kind: 'text',
        markdown:
          "Texas Hold'em is played with a standard 52-card deck. Each player gets **two private cards** (your *hole cards*) and shares **five community cards** dealt in the middle. You make the best five-card hand using any combination of your two cards and the five on the board.",
      },
      {
        kind: 'text',
        markdown:
          'Before cards are dealt, two players post forced bets called **blinds** — the *small blind* and the *big blind* — so there is always something to play for. A round disc, the **button**, marks the dealer position and moves one seat to the left every hand.',
      },
      {
        kind: 'text',
        markdown:
          'The hand plays over four betting rounds:\n\n1. **Preflop** — after the two hole cards are dealt.\n2. **Flop** — three community cards.\n3. **Turn** — a fourth community card.\n4. **River** — the fifth and final card.\n\nIf two or more players remain after the river, there is a **showdown** and the best hand wins the pot.',
      },
      { kind: 'streetTimeline' },
      {
        kind: 'callout',
        tone: 'tip',
        text: 'On each round you can fold (give up), check/call (stay in), or bet/raise (put in more). You only ever need to match the current bet to keep playing.',
      },
    ],
  },
  {
    id: 'hand-rankings',
    title: 'Hand Rankings',
    category: 'rankings',
    estMinutes: 5,
    blocks: [
      {
        kind: 'text',
        markdown:
          'Hands are ranked from strongest to weakest. When two players reach showdown, the higher-ranked hand wins. Ties are broken by the highest cards (*kickers*).',
      },
      { kind: 'handRankTable' },
      {
        kind: 'cardExample',
        cards: [c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's')],
        caption: 'Royal flush — the best possible hand (a ten-to-ace straight flush).',
      },
      {
        kind: 'cardExample',
        cards: [c(9, 'c'), c(9, 'd'), c(9, 'h'), c(5, 's'), c(5, 'c')],
        caption: 'Full house — three of a kind plus a pair (“nines full of fives”).',
      },
      {
        kind: 'tapQuiz',
        prompt: 'Showdown — tap the winning hand.',
        options: [
          { cards: [c(9, 'c'), c(8, 'd'), c(7, 'h'), c(6, 's'), c(5, 'c')], label: 'Straight, nine high' },
          { cards: [c(14, 's'), c(11, 's'), c(9, 's'), c(5, 's'), c(2, 's')], label: 'Flush, ace high' },
        ],
        correctIndex: 1,
        explanation:
          'A flush beats a straight — five cards of one suit sit a full rung above five in a row. Check the ladder above.',
      },
      {
        kind: 'callout',
        tone: 'warning',
        text: 'A common beginner mistake: an Ace can make the lowest straight (A-2-3-4-5, the “wheel”), where it counts as low. In that straight the 5 is the high card.',
      },
    ],
  },
  {
    id: 'positions',
    title: 'Position & the Blinds',
    category: 'positions',
    estMinutes: 4,
    blocks: [
      {
        kind: 'text',
        markdown:
          '**Position** is where you sit relative to the button. Acting *later* in a betting round is a big advantage: you see what everyone else does before you decide.',
      },
      { kind: 'positionDiagram' },
      {
        kind: 'text',
        markdown:
          '- **The button** acts last after the flop — the best seat at the table.\n- **The blinds** (small and big) act first after the flop — the toughest spots.\n- **Early position** players should play tighter (fewer hands); **late position** players can play more hands profitably.',
      },
      {
        kind: 'callout',
        tone: 'tip',
        text: 'Rule of thumb for beginners: play strong hands from anywhere, and only add weaker playable hands when you are in late position.',
      },
    ],
  },
  {
    id: 'pot-odds',
    title: 'Pot Odds Made Simple',
    category: 'odds',
    estMinutes: 5,
    blocks: [
      {
        kind: 'text',
        markdown:
          '**Pot odds** tell you whether a call is worth it. They compare the cost of calling to the size of the pot you could win.',
      },
      {
        kind: 'text',
        markdown:
          'If the pot is **$80** and it costs **$20** to call, you are risking 20 to win 100 (the 80 already there plus your 20). That is `20 / 100 = 20%`. So if your hand wins **more than 20%** of the time, calling makes money in the long run.',
      },
      { kind: 'potOddsWidget' },
      {
        kind: 'text',
        markdown:
          "To estimate how often a *draw* completes, count your **outs** (cards that make your hand) and use the **rule of 2 and 4**: multiply outs by 4 on the flop (two cards to come) or by 2 on the turn. A flush draw has 9 outs → about 36% on the flop.",
      },
      {
        kind: 'callout',
        tone: 'tip',
        text: 'The coaching rail during play shows your equity and the pot odds side by side — call when your equity is higher than the pot odds.',
      },
    ],
  },
];

export const LESSONS_BY_ID: Record<string, Lesson> = Object.fromEntries(
  LESSONS.map((l) => [l.id, l]),
);
