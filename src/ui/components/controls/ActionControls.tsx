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
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const clamped = clamp(amount);

  const has = (t: Action['type']) => legal.some((a) => a.type === t);
  const callAction = legal.find((a) => a.type === 'call');
  const toCall = callAction?.callAmount ?? 0;
  const pot = game.pots.reduce((s, p) => s + p.amount, 0);
  const base = game.currentBet > 0 ? game.currentBet : game.bigBlind;

  // Preset raise-to targets, clamped to the legal range.
  const presets: { label: string; value: number }[] = [
    { label: '2X', value: clamp(base * 2) },
    { label: '2.5X', value: clamp(base * 2.5) },
    { label: '3X', value: clamp(base * 3) },
    { label: 'POT', value: clamp(game.currentBet + pot + toCall) },
  ];
  const fill = max > min ? ((clamped - min) / (max - min)) * 100 : 0;

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="action-bar">
      {betOrRaise && (
        <div className="action-row action-row-bet">
          <span className="bet-label">BET SIZE</span>
          {presets.map((p) => (
            <button
              key={p.label}
              className={`bet-preset${clamped === p.value ? ' bet-preset-active' : ''}`}
              disabled={disabled}
              onClick={() => setAmount(p.value)}
            >
              {p.label}
            </button>
          ))}
          <div className="bet-slider">
            <input
              type="range"
              min={min}
              max={max}
              value={clamped}
              disabled={disabled}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <span className="bet-slider-fill" style={{ width: `${fill}%` }} />
            <span className="bet-slider-knob" style={{ left: `${fill}%` }} />
          </div>
          <div className="bet-stepper">
            <button
              className="bet-step"
              disabled={disabled}
              onClick={() => setAmount(clamp(clamped - game.bigBlind))}
              aria-label="decrease bet"
            >
              −
            </button>
            <span className="bet-step-amount">{fmt(clamped)}</span>
            <button
              className="bet-step"
              disabled={disabled}
              onClick={() => setAmount(clamp(clamped + game.bigBlind))}
              aria-label="increase bet"
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="action-row action-row-buttons">
        {has('fold') && (
          <button className="btn btn-red action-btn" disabled={disabled} onClick={() => onAction({ type: 'fold', seatId })}>
            FOLD
          </button>
        )}
        {has('check') && (
          <button className="btn btn-blue action-btn" disabled={disabled} onClick={() => onAction({ type: 'check', seatId })}>
            CHECK
          </button>
        )}
        {has('call') && (
          <button className="btn btn-blue action-btn" disabled={disabled} onClick={() => onAction({ type: 'call', seatId })}>
            CALL {fmt(toCall)}
          </button>
        )}
        {has('allin') && (
          <button
            className="btn btn-outline-orange action-btn"
            disabled={disabled}
            onClick={() => onAction({ type: 'allin', seatId })}
          >
            ALL-IN {fmt(seat.committedThisStreet + seat.stack)}
          </button>
        )}
        {betOrRaise && (
          <button
            className="btn btn-orange action-btn action-btn-raise"
            disabled={disabled}
            onClick={() => onAction({ type: betOrRaise.type as 'bet' | 'raise', seatId, amount: clamped })}
          >
            {betOrRaise.type === 'bet' ? 'BET' : 'RAISE TO'} {fmt(clamped)}
          </button>
        )}
      </div>
    </div>
  );
}
