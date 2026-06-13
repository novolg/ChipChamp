import { useState } from 'react';
import type { Card } from '../../engine/types';
import { HandCategory, HAND_CATEGORY_LABEL } from '../../engine/evaluator';
import { PlayingCard } from './table/Card';

const c = (rank: number, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

const EXAMPLES: Record<HandCategory, { cards: Card[]; blurb: string }> = {
  [HandCategory.StraightFlush]: {
    cards: [c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's')],
    blurb: 'Five in a row, all one suit. Ace-high is the royal flush — the best hand in poker.',
  },
  [HandCategory.FourOfAKind]: {
    cards: [c(9, 'c'), c(9, 'd'), c(9, 'h'), c(9, 's'), c(2, 'c')],
    blurb: 'All four cards of one rank. Nearly unbeatable.',
  },
  [HandCategory.FullHouse]: {
    cards: [c(9, 'c'), c(9, 'd'), c(9, 'h'), c(5, 's'), c(5, 'c')],
    blurb: 'Three of a kind plus a pair — “nines full of fives”.',
  },
  [HandCategory.Flush]: {
    cards: [c(14, 's'), c(11, 's'), c(9, 's'), c(5, 's'), c(2, 's')],
    blurb: 'Any five cards of the same suit. Ranked by the highest card.',
  },
  [HandCategory.Straight]: {
    cards: [c(9, 'c'), c(8, 'd'), c(7, 'h'), c(6, 's'), c(5, 'c')],
    blurb: 'Five ranks in a row, suits mixed.',
  },
  [HandCategory.ThreeOfAKind]: {
    cards: [c(9, 'c'), c(9, 'd'), c(9, 'h'), c(5, 's'), c(2, 'c')],
    blurb: 'Three cards of one rank — a “set” when made with a pocket pair.',
  },
  [HandCategory.TwoPair]: {
    cards: [c(9, 'c'), c(9, 'd'), c(5, 'h'), c(5, 's'), c(2, 'c')],
    blurb: 'Two different pairs. The higher pair breaks ties first.',
  },
  [HandCategory.Pair]: {
    cards: [c(9, 'c'), c(9, 'd'), c(7, 'h'), c(5, 's'), c(2, 'c')],
    blurb: 'One pair. The three side cards (kickers) settle ties.',
  },
  [HandCategory.HighCard]: {
    cards: [c(14, 'c'), c(11, 'd'), c(9, 'h'), c(5, 's'), c(2, 'c')],
    blurb: 'No combination at all — just your biggest card.',
  },
};

const ORDER = [
  HandCategory.StraightFlush,
  HandCategory.FourOfAKind,
  HandCategory.FullHouse,
  HandCategory.Flush,
  HandCategory.Straight,
  HandCategory.ThreeOfAKind,
  HandCategory.TwoPair,
  HandCategory.Pair,
  HandCategory.HighCard,
];

/** Interactive ladder of the nine hand categories, strongest first. Click a
 *  row to preview it with real cards. Built from the engine's category enum
 *  so it can never drift from the actual rules. */
export function HandRankTable() {
  const [selected, setSelected] = useState<HandCategory>(HandCategory.StraightFlush);
  const example = EXAMPLES[selected];

  return (
    <div className="rank-explorer">
      <table className="rank-table">
        <thead>
          <tr><th>#</th><th>Hand</th><th aria-hidden="true"></th></tr>
        </thead>
        <tbody>
          {ORDER.map((cat, i) => (
            <tr
              key={cat}
              className={`rank-row${cat === selected ? ' rank-row-active' : ''}`}
              onClick={() => setSelected(cat)}
            >
              <td>{i + 1}</td>
              <td>{HAND_CATEGORY_LABEL[cat]}</td>
              {/* Always rendered; CSS reveals it on hover / active row. */}
              <td className="rank-row-chevron" aria-hidden="true">▸</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rank-preview" key={selected}>
        <div className="rank-preview-cards">
          {example.cards.map((card, i) => (
            <PlayingCard key={i} card={card} size="sm" />
          ))}
        </div>
        <span className="rank-preview-name">{HAND_CATEGORY_LABEL[selected]}</span>
        <p className="rank-preview-blurb">{example.blurb}</p>
      </div>
    </div>
  );
}
