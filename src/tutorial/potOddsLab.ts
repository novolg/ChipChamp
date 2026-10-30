/** Pot includes the opponent's bet but excludes our call. No future betting or rake. */
export function requiredEquity(potBeforeCall: number, call: number): number {
  if (!Number.isFinite(potBeforeCall) || !Number.isFinite(call) || potBeforeCall < 0 || call < 0) {
    throw new RangeError('Pot and call must be finite, non-negative amounts.');
  }
  return call === 0 ? 0 : call / (potBeforeCall + call);
}

export const ODDS_DECISIONS = [
  { pot: 120, call: 30, equity: 0.25, correct: 'call',
    explanation: 'Calling costs 30 to contest a final pot of 150. You need 20% equity. With the assumed 25% equity, calling has positive expected value.' },
  { pot: 180, call: 60, equity: 0.20, correct: 'fold',
    explanation: 'Calling costs 60 to contest a final pot of 240. You need 25% equity, but the assumed equity is only 20%. Folding avoids a negative-value call.' },
] as const;
