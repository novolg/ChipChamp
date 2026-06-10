import { HandCategory, HAND_CATEGORY_LABEL } from '../../engine/evaluator';

const EXAMPLES: Record<HandCategory, string> = {
  [HandCategory.StraightFlush]: 'A♠ K♠ Q♠ J♠ T♠',
  [HandCategory.FourOfAKind]: '9♣ 9♦ 9♥ 9♠ 2♣',
  [HandCategory.FullHouse]: '9♣ 9♦ 9♥ 5♠ 5♣',
  [HandCategory.Flush]: 'A♠ J♠ 9♠ 5♠ 2♠',
  [HandCategory.Straight]: '9♣ 8♦ 7♥ 6♠ 5♣',
  [HandCategory.ThreeOfAKind]: '9♣ 9♦ 9♥ 5♠ 2♣',
  [HandCategory.TwoPair]: '9♣ 9♦ 5♥ 5♠ 2♣',
  [HandCategory.Pair]: '9♣ 9♦ 7♥ 5♠ 2♣',
  [HandCategory.HighCard]: 'A♣ J♦ 9♥ 5♠ 2♣',
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

/** Reference table of the nine hand categories, strongest first. Rendered from
 *  the engine's category enum so it can never drift from the actual rules. */
export function HandRankTable() {
  return (
    <table className="rank-table">
      <thead>
        <tr><th>#</th><th>Hand</th><th>Example</th></tr>
      </thead>
      <tbody>
        {ORDER.map((cat, i) => (
          <tr key={cat}>
            <td>{i + 1}</td>
            <td>{HAND_CATEGORY_LABEL[cat]}</td>
            <td className="rank-example">{EXAMPLES[cat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
