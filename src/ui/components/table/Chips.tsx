interface ChipsProps {
  amount: number;
  label?: string;
}

/** A small chip stack badge showing a chip amount committed to the pot. */
export function Chips({ amount, label }: ChipsProps) {
  if (amount <= 0) return null;
  return (
    <div className="chips" title={label}>
      <span className="chip-dot" aria-hidden />
      <span className="chip-amount">{amount.toLocaleString()}</span>
    </div>
  );
}
