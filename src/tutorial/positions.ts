export type PositionStreet = 'preflop' | 'flop';

/** First pass of a betting round, before any raise reopens the action.
 * Seats are numbered clockwise from the dealer. Folded seats retain their position. */
export function openingActionOrder(players: 2 | 6, street: PositionStreet, folded: readonly number[] = []): number[] {
  const first = players === 2 ? street === 'preflop' ? 0 : 1 : street === 'preflop' ? 3 : 1;
  return Array.from({ length: players }, (_, i) => (first + i) % players).filter((seat) => !folded.includes(seat));
}

export const POSITION_NAMES = ['Button', 'Small blind', 'Big blind', 'Under the gun', 'Middle position', 'Cutoff'];
export const POSITION_LABELS = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
export const positionName = (seat: number, players: 2 | 6) => players === 2 ? seat === 0 ? 'Button / small blind' : 'Big blind' : POSITION_NAMES[seat];
export const positionLabel = (seat: number, players: 2 | 6) => players === 2 ? seat === 0 ? 'BTN / SB' : 'BB' : POSITION_LABELS[seat];

export interface PositionSpot {
  title: string;
  players: 2 | 6;
  street: PositionStreet;
  folded: number[];
  hint: string;
  explanation: string;
}
export const POSITION_SPOTS: PositionSpot[] = [
  { title: 'Before the flop', players: 6, street: 'preflop', folded: [],
    hint: 'The blinds have already posted chips. The first decision belongs to the player immediately after the big blind.',
    explanation: 'The big blind closes the first pass before the flop. The button still has both blinds behind it. A raise can reopen the action, so this is the initial order, not a promise that betting ends here.' },
  { title: 'After the flop', players: 6, street: 'flop', folded: [],
    hint: 'After the flop, start with the first active player clockwise after the button.',
    explanation: 'The button acts last on the flop, turn and river. It sees five opponents act before making its first decision. That extra information is the advantage of position.' },
  { title: 'The button has folded', players: 6, street: 'flop', folded: [0, 3],
    hint: 'Keep the seats in place and skip folded players. Who is the last remaining seat before the button?',
    explanation: 'The cutoff acts last because the button has folded. Position depends on who is still in the hand, not just the badge on a seat.' },
  { title: 'Only two players remain', players: 2, street: 'flop', folded: [],
    hint: 'Heads-up has a special blind rule: the button posts the small blind. After the flop, the big blind goes first.',
    explanation: 'Heads-up, the button is also the small blind. It acts first preflop but last after the flop. The big blind acts first on the flop, turn and river.' },
];
