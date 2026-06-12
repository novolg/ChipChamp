interface ChipsProps {
  amount: number;
  /** Chip colour for the stack. Raiser/aggressor seats use orange. */
  tone?: 'blue' | 'orange';
  label?: string;
}

/** A bet/commit pill: a couple of overlapping poker-chip images + a mono amount.
 *  Keyed on the amount so each bet change replays the pop-in animation. */
export function Chips({ amount, tone = 'blue', label }: ChipsProps) {
  if (amount <= 0) return null;
  const chip = `/assets/chip-${tone}.png`;
  return (
    <div key={amount} className={`chips chips-${tone}`} title={label}>
      <span className="chips-stack" aria-hidden="true">
        <img src={chip} alt="" className="chips-img chips-img-0" />
        <img src={chip} alt="" className="chips-img chips-img-1" />
      </span>
      <span className="chips-amount">{amount.toLocaleString()}</span>
    </div>
  );
}
