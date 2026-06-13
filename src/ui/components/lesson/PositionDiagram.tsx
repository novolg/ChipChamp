import { useState } from 'react';
import { playSfx } from '../../lib/sound';

interface SeatInfo {
  id: string;
  label: string;
  name: string;
  tone: 'gold' | 'blue' | 'red' | 'green';
  tag: string;
  text: string;
  /** Position around the table ellipse (SVG coords). */
  x: number;
  y: number;
}

/* Clockwise from the button at the bottom (a person at the bottom of the
   screen faces the table, so their left — the next seat to act — is screen-left). */
const SEATS: SeatInfo[] = [
  {
    id: 'btn', label: 'BTN', name: 'The Button', tone: 'gold', tag: 'ACTS LAST POSTFLOP — BEST SEAT',
    text: 'The dealer position. After the flop you act last on every street: you see what everyone does before deciding. Play your widest range of hands here.',
    x: 210, y: 212,
  },
  {
    id: 'sb', label: 'SB', name: 'Small Blind', tone: 'blue', tag: 'FORCED BET — ACTS FIRST POSTFLOP',
    text: 'Posts half a bet before seeing any cards, then acts first after the flop. The toughest seat at the table — keep your range tight.',
    x: 62, y: 168,
  },
  {
    id: 'bb', label: 'BB', name: 'Big Blind', tone: 'blue', tag: 'FORCED BET — CLOSES PREFLOP',
    text: 'Posts a full bet blind. You act last preflop (you can check if no one raised) but early after the flop. Defend it selectively.',
    x: 62, y: 72,
  },
  {
    id: 'utg', label: 'UTG', name: 'Under the Gun', tone: 'red', tag: 'FIRST TO ACT — PLAY TIGHT',
    text: 'First to act preflop, with the whole table still to speak behind you. Stick to strong hands only.',
    x: 210, y: 28,
  },
  {
    id: 'mp', label: 'MP', name: 'Middle Position', tone: 'red', tag: 'EARLY-ISH — STILL TIGHT',
    text: 'A little better than under the gun, but several players still act after you. Loosen up only slightly.',
    x: 358, y: 72,
  },
  {
    id: 'co', label: 'CO', name: 'Cutoff', tone: 'green', tag: 'LATE POSITION — STRONG',
    text: 'One seat before the button. Only the button acts after you postflop, so you can profitably add many more hands.',
    x: 358, y: 168,
  },
];

const TONE_FILL: Record<SeatInfo['tone'], string> = {
  gold: '#ffa502',
  blue: '#3b8fff',
  red: '#ff4757',
  green: '#2ed573',
};

/** Clickable 6-max table map: tap a seat to learn what that position means. */
export function PositionDiagram() {
  const [selectedId, setSelectedId] = useState('btn');
  const selected = SEATS.find((s) => s.id === selectedId)!;

  const select = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    playSfx('click');
  };

  return (
    <div className="posmap">
      <svg viewBox="0 0 420 240" className="posmap-svg" role="group" aria-label="table positions">
        <ellipse cx="210" cy="120" rx="186" ry="104" fill="#18233e" />
        <ellipse cx="210" cy="120" rx="174" ry="92" fill="#142c5c" stroke="rgba(110,160,255,0.35)" strokeWidth="2" />
        <text x="210" y="116" textAnchor="middle" className="posmap-felt-label">ACTION MOVES</text>
        <text x="210" y="134" textAnchor="middle" className="posmap-felt-label">CLOCKWISE →</text>
        {SEATS.map((seat) => {
          const active = seat.id === selectedId;
          return (
            <g
              key={seat.id}
              className={`posmap-seat${active ? ' posmap-seat-active' : ''}`}
              onClick={() => select(seat.id)}
              role="button"
              aria-pressed={active}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') select(seat.id);
              }}
            >
              <circle cx={seat.x} cy={seat.y} r="23" fill={TONE_FILL[seat.tone]} opacity={active ? 1 : 0.45} />
              <circle
                cx={seat.x}
                cy={seat.y}
                r="23"
                fill="none"
                stroke={active ? '#fff' : 'transparent'}
                strokeWidth="2.5"
              />
              <text x={seat.x} y={seat.y + 4.5} textAnchor="middle" className="posmap-seat-label">
                {seat.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="posmap-info" key={selectedId}>
        <div className="posmap-info-head">
          <span className="posmap-info-name">{selected.name}</span>
          <span className={`posmap-info-tag posmap-tag-${selected.tone}`}>{selected.tag}</span>
        </div>
        <p className="posmap-info-text">{selected.text}</p>
      </div>
    </div>
  );
}
