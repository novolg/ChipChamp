import { useState } from 'react';
import type { Action, GameState } from '../../../engine/types';
import { getLegalActions, getSeat } from '../../../engine/betting';

interface ActionControlsProps {
  game: GameState;
  seatId: number;
  onAction: (action: Action) => void;
  disabled?: boolean;
}

export function ActionControls({ game, seatId, onAction, disabled }: ActionControlsProps) {
  const legal = getLegalActions(game);
  const seat = getSeat(game, seatId);
  const betOrRaise = legal.find((a) => a.type === 'bet' || a.type === 'raise');

  const min = betOrRaise?.min ?? 0;
  const max = betOrRaise?.max ?? 0;
  const [amount, setAmount] = useState(min);

  // Keep the slider within the current legal range.
  const clamped = Math.max(min, Math.min(max, amount));

  const has = (t: Action['type']) => legal.some((a) => a.type === t);
  const callAction = legal.find((a) => a.type === 'call');

  return (
    <div className="action-controls">
      {has('fold') && (
        <button className="btn btn-fold" disabled={disabled} onClick={() => onAction({ type: 'fold', seatId })}>
          Fold
        </button>
      )}
      {has('check') && (
        <button className="btn" disabled={disabled} onClick={() => onAction({ type: 'check', seatId })}>
          Check
        </button>
      )}
      {has('call') && (
        <button className="btn btn-call" disabled={disabled} onClick={() => onAction({ type: 'call', seatId })}>
          Call {callAction?.callAmount?.toLocaleString()}
        </button>
      )}

      {betOrRaise && (
        <div className="bet-group">
          <input
            type="range"
            min={min}
            max={max}
            value={clamped}
            disabled={disabled}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <span className="bet-amount">{clamped.toLocaleString()}</span>
          <button
            className="btn btn-raise"
            disabled={disabled}
            onClick={() => onAction({ type: betOrRaise.type as 'bet' | 'raise', seatId, amount: clamped })}
          >
            {betOrRaise.type === 'bet' ? 'Bet' : 'Raise to'}
          </button>
        </div>
      )}

      {has('allin') && (
        <button className="btn btn-allin" disabled={disabled} onClick={() => onAction({ type: 'allin', seatId })}>
          All-in {(seat.committedThisStreet + seat.stack).toLocaleString()}
        </button>
      )}
    </div>
  );
}
