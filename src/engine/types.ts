// Core domain types for the poker engine. Pure data — no UI, no React.

export type Suit = 'c' | 'd' | 'h' | 's';

/** Rank value. 2..10 face value; 11=J, 12=Q, 13=K, 14=A. Ace is high here;
 *  the evaluator handles the ace-low (wheel) straight as a special case. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

/** A deck is an ordered list of cards; index 0 is the top (next to be dealt). */
export type Deck = Card[];

export enum Street {
  Preflop = 'preflop',
  Flop = 'flop',
  Turn = 'turn',
  River = 'river',
  Showdown = 'showdown',
}

export type ActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'allin'
  | 'postBlind';

export interface Action {
  type: ActionType;
  seatId: number;
  /** Chips ADDED to the pot by this action (call/bet/raise/blind). 0 for fold/check. */
  amount?: number;
}

export type SeatStatus = 'active' | 'folded' | 'allin' | 'out';

export interface Seat {
  id: number;
  name: string;
  isHuman: boolean;
  stack: number;
  holeCards: Card[]; // length 0 or 2
  /** Chips committed in the CURRENT betting round. */
  committedThisStreet: number;
  /** Chips committed across the whole hand (drives side-pot math). */
  committedTotal: number;
  status: SeatStatus;
  /** Whether this seat has acted at least once in the current betting round. */
  hasActedThisStreet: boolean;
}

export interface Pot {
  amount: number;
  eligibleSeatIds: number[];
}

export type EnginePhase = 'betting' | 'dealing' | 'showdown' | 'handComplete';

export interface HandLogEntry {
  street: Street;
  action?: Action;
  note?: string;
}

export interface GameState {
  seats: Seat[];
  buttonSeatId: number;
  smallBlind: number;
  bigBlind: number;
  street: Street;
  board: Card[];
  deck: Deck;
  pots: Pot[];
  /** Whose turn it is; null when the current betting round (or hand) is complete. */
  toActSeatId: number | null;
  /** Highest committedThisStreet that must be matched. */
  currentBet: number;
  /** Minimum legal raise INCREMENT (on top of currentBet). */
  minRaise: number;
  lastAggressorSeatId: number | null;
  /** Size of the last full raise — gates whether a short all-in reopens action. */
  lastFullRaiseSize: number;
  rngState: number;
  handNumber: number;
  log: HandLogEntry[];
  phase: EnginePhase;
}
