import type { GameState } from '../../../engine/types';
import { cardLabel } from '../../lib/cardLabel';
import { handSummary } from '../../lib/result';

/** Canvas cards are decorative; this text exposes only information the hero sees. */
export function TableReadout({ game }: { game: GameState }) {
  const hero = game.seats.find(s => s.isHuman);
  const acting = game.seats.find(s => s.id === game.toActSeatId);
  const result = handSummary(game);
  return <section className="table-readout" aria-label="Table information">
    <p role="status" aria-atomic="true">{result ?? `${game.street}. ${acting?.isHuman ? 'Your turn.' : acting ? `${acting.name} to act.` : 'Waiting for the next action.'}`}</p>
    <p>Your cards: {hero?.holeCards.map(cardLabel).join(', ') || 'not dealt'}.</p>
    <p>Community cards: {game.board.map(cardLabel).join(', ') || 'none yet'}.</p>
    <ul>{game.seats.map(seat => <li key={seat.id}>{seat.name}: {seat.stack} chips, {seat.status}.</li>)}</ul>
  </section>;
}

export function PotBreakdown({ game }: { game: GameState }) {
  const payouts = game.result?.payouts;
  if (game.phase !== 'handComplete' || !payouts || payouts.length < 2) return null;
  const indices = [...new Set(payouts.map(p => p.potIndex))].sort((a, b) => a - b);
  return <details className="pot-breakdown">
    <summary>Pot breakdown</summary>
    <ul>{indices.map(index => {
      const awards = payouts.filter(p => p.potIndex === index);
      return <li key={index}><strong>{index === 0 ? 'Main pot' : `Side pot ${index}`}: {awards.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</strong>
        <span>{awards.map(p => `${game.seats.find(s => s.id === p.seatId)?.name ?? 'Player'} receives ${p.amount.toLocaleString()}`).join(' · ')}</span>
      </li>;
    })}</ul>
    <p>Amounts received from each pot, before subtracting the chips each player contributed.</p>
  </details>;
}
