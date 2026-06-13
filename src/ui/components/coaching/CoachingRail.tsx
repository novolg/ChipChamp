import type { GameState } from '../../../engine/types';
import type { ActionType } from '../../../engine/types';
import { advise } from '../../../advisor/advisor';

interface CoachingRailProps {
  game: GameState;
  seatId: number;
  /** True when it's the hero's turn — advice is live. */
  active: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ACTION_LABEL: Record<string, string> = {
  fold: 'FOLD', check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE', allin: 'ALL-IN',
};
const ACTION_BTN: Record<ActionType, string> = {
  fold: 'btn-red', check: 'btn-blue', call: 'btn-blue',
  bet: 'btn-orange', raise: 'btn-orange', allin: 'btn-orange', postBlind: 'btn-blue',
};

export function CoachingRail({ game, seatId, active }: CoachingRailProps) {
  const seat = game.seats.find((s) => s.id === seatId);
  const canAdvise = active && seat && seat.holeCards.length === 2 && game.phase === 'betting';
  const advice = canAdvise ? advise(game, seatId) : null;
  const equityFill = advice ? Math.min(100, advice.equityEstimate * 100) : 0;
  const needMark = advice && advice.potOdds > 0 ? Math.min(100, advice.potOdds * 100) : null;

  return (
    <aside className="coach">
      <div className="coach-head">
        <span className="coach-title">COACH</span>
        <span className={`coach-live${advice ? ' coach-live-on' : ''}`} aria-label="live coaching" />
      </div>

      {!advice && (
        <p className="coach-idle">
          {game.phase === 'handComplete'
            ? 'Hand complete. Deal the next hand to keep learning.'
            : "Advice appears here when it's your turn."}
        </p>
      )}

      {advice && (
        /* display: contents wrapper keyed per street so the staggered
           reveal replays as the hand progresses. */
        <div className="coach-advice" key={game.street}>
          <div className="coach-tiles">
            <div className="coach-tile">
              <span className="coach-tile-label">HAND</span>
              <span className="coach-tile-value">{advice.handStrengthLabel}</span>
            </div>
            <div className="coach-tile">
              <span className="coach-tile-label">EQUITY</span>
              <span className="coach-tile-value coach-equity">{pct(advice.equityEstimate)}</span>
            </div>
            <div className="coach-tile">
              <span className="coach-tile-label">NEEDS</span>
              <span className="coach-tile-value coach-needs">
                {advice.potOdds > 0 ? pct(advice.potOdds) : '—'}
              </span>
            </div>
          </div>

          <div className="coach-bar">
            {/* Transform-only fill so the spring stays on the compositor. */}
            <span className="coach-bar-fill" style={{ transform: `scaleX(${equityFill / 100})` }} />
            {needMark !== null && (
              <span className="coach-bar-mark" style={{ left: `${needMark}%` }} />
            )}
          </div>

          <div className="coach-suggest">
            {/* Keyed so the button re-pops when the suggestion changes. */}
            <button key={advice.suggestedAction} className={`btn ${ACTION_BTN[advice.suggestedAction]} coach-suggest-btn`} disabled>
              {ACTION_LABEL[advice.suggestedAction]}
              {advice.suggestedAmount ? ` ${advice.suggestedAmount.toLocaleString()}` : ''}
            </button>
            <span className="coach-confidence">
              {advice.confidence.toUpperCase()}
              <br />
              CONFIDENCE
            </span>
          </div>

          <p className="coach-note">{advice.reasoning}</p>
        </div>
      )}
    </aside>
  );
}
