import { useState } from 'react';
import type { GameState } from '../../../engine/types';
import { advise } from '../../../advisor/advisor';

interface CoachingRailProps {
  game: GameState;
  seatId: number;
  /** True when it's the hero's turn — advice is live. */
  active: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ACTION_LABEL: Record<string, string> = {
  fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in',
};

export function CoachingRail({ game, seatId, active }: CoachingRailProps) {
  const [showWhy, setShowWhy] = useState(true);
  const seat = game.seats.find((s) => s.id === seatId);
  const canAdvise = active && seat && seat.holeCards.length === 2 && game.phase === 'betting';
  const advice = canAdvise ? advise(game, seatId) : null;

  return (
    <aside className="coach-rail">
      <h2 className="coach-title">Coach</h2>

      {!advice && (
        <p className="subtitle coach-idle">
          {game.phase === 'handComplete'
            ? 'Hand complete. Deal the next hand to keep learning.'
            : 'Advice appears here when it’s your turn.'}
        </p>
      )}

      {advice && (
        <div className="coach-body">
          <div className="coach-row">
            <span className="label">Your hand</span>
            <span className="coach-value">{advice.handStrengthLabel}</span>
          </div>
          <div className="coach-row">
            <span className="label">Equity</span>
            <span className="coach-value">~{pct(advice.equityEstimate)}</span>
          </div>
          {advice.potOdds > 0 && (
            <div className="coach-row">
              <span className="label">Pot odds</span>
              <span className="coach-value">~{pct(advice.potOdds)} to call</span>
            </div>
          )}

          <div className="coach-suggest">
            <span className="label">Suggested</span>
            <span className={`suggest-pill suggest-${advice.suggestedAction}`}>
              {ACTION_LABEL[advice.suggestedAction]}
              {advice.suggestedAmount ? ` ${advice.suggestedAmount.toLocaleString()}` : ''}
            </span>
            <span className={`confidence confidence-${advice.confidence}`}>{advice.confidence} confidence</span>
          </div>

          <button className="why-toggle" onClick={() => setShowWhy((v) => !v)}>
            {showWhy ? '▾ Why' : '▸ Why'}
          </button>
          {showWhy && (
            <div className="why-panel">
              <p className="why-reason">{advice.reasoning}</p>
              <ul className="why-detail">
                {advice.detail.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
