import type { Action, Card, Deck, GameState, Pot, Seat, SeatStatus } from './types';
import { Street } from './types';
import { createDeck, shuffle } from './deck';
import { nextToAct, getSeat } from './betting';
import { resolveShowdown } from './pots';
import { evaluateHand, HAND_CATEGORY_LABEL } from './evaluator';

export interface SeatConfig {
  id: number;
  name: string;
  isHuman: boolean;
  stack: number;
}

export interface TableConfig {
  seats: SeatConfig[];
  buttonSeatId: number;
  smallBlind: number;
  bigBlind: number;
  seed: number;
}

export interface StartHandOptions {
  /** Pre-stacked deck for scripted tutorial hands (deals exact cards). */
  deck?: Deck;
  /** Override the button seat (otherwise uses current state.buttonSeatId). */
  buttonSeatId?: number;
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

/** Create a fresh table (no hand in progress yet). */
export function createTable(config: TableConfig): GameState {
  const seats: Seat[] = config.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isHuman: s.isHuman,
    stack: s.stack,
    holeCards: [],
    committedThisStreet: 0,
    committedTotal: 0,
    status: (s.stack > 0 ? 'active' : 'out') as SeatStatus,
    hasActedThisStreet: false,
  }));

  return {
    seats,
    buttonSeatId: config.buttonSeatId,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    street: Street.Preflop,
    board: [],
    deck: [],
    pots: [],
    toActSeatId: null,
    currentBet: 0,
    minRaise: config.bigBlind,
    lastAggressorSeatId: null,
    lastFullRaiseSize: config.bigBlind,
    rngState: config.seed,
    handNumber: 0,
    log: [],
    phase: 'handComplete',
  };
}

/** Index of a seat by id. */
function idx(state: GameState, id: number): number {
  return state.seats.findIndex((s) => s.id === id);
}

/** Next seat clockwise from `fromId` that is not 'out' (i.e. is in this hand). */
function nextOccupied(state: GameState, fromId: number): number {
  const n = state.seats.length;
  let i = (idx(state, fromId) + 1) % n;
  for (let k = 0; k < n; k++) {
    if (state.seats[i].status !== 'out') return state.seats[i].id;
    i = (i + 1) % n;
  }
  throw new Error('No occupied seat found');
}

/** Rotate the button to the next occupied seat. */
export function rotateButton(state: GameState): GameState {
  const next = clone(state);
  next.buttonSeatId = nextOccupied(state, state.buttonSeatId);
  return next;
}

function commitChips(seat: Seat, amount: number): void {
  const chips = Math.min(amount, seat.stack);
  seat.stack -= chips;
  seat.committedThisStreet += chips;
  seat.committedTotal += chips;
  if (seat.stack === 0 && seat.status === 'active') seat.status = 'allin';
}

/** Total chips in the pot (for display); proper side pots computed at showdown. */
function displayPots(state: GameState): Pot[] {
  const total = state.seats.reduce((sum, s) => sum + s.committedTotal, 0);
  if (total === 0) return [];
  const eligible = state.seats
    .filter((s) => s.status === 'active' || s.status === 'allin')
    .map((s) => s.id);
  return [{ amount: total, eligibleSeatIds: eligible }];
}

/** Deal hole cards (2 each), one card per seat per pass, starting left of button. */
function dealHoleCards(state: GameState): void {
  const order = handDealOrder(state);
  for (let round = 0; round < 2; round++) {
    for (const seatId of order) {
      const card = state.deck.shift();
      if (!card) throw new Error('Deck exhausted dealing hole cards');
      getSeat(state, seatId).holeCards.push(card);
    }
  }
}

/** Occupied seats clockwise starting left of the button. */
function handDealOrder(state: GameState): number[] {
  const order: number[] = [];
  let id = nextOccupied(state, state.buttonSeatId);
  for (let k = 0; k < state.seats.length; k++) {
    const seat = getSeat(state, id);
    if (seat.status !== 'out') order.push(id);
    const nxt = nextOccupied(state, id);
    if (nxt === order[0]) break;
    id = nxt;
  }
  return order;
}

/** Begin a new hand: deal, post blinds, set first to act. */
export function startHand(state: GameState, opts: StartHandOptions = {}): GameState {
  const next = clone(state);
  if (opts.buttonSeatId !== undefined) next.buttonSeatId = opts.buttonSeatId;

  const occupied = next.seats.filter((s) => s.stack > 0);
  if (occupied.length < 2) throw new Error('Need at least 2 seats with chips');

  next.handNumber += 1;
  next.street = Street.Preflop;
  next.board = [];
  next.log = [{ street: Street.Preflop, note: `Hand #${next.handNumber}` }];

  for (const seat of next.seats) {
    seat.holeCards = [];
    seat.committedThisStreet = 0;
    seat.committedTotal = 0;
    seat.hasActedThisStreet = false;
    seat.status = seat.stack > 0 ? 'active' : 'out';
  }

  if (opts.deck) {
    next.deck = opts.deck.slice();
  } else {
    const [shuffled, rngState] = shuffle(createDeck(), next.rngState);
    next.deck = shuffled;
    next.rngState = rngState;
  }

  dealHoleCards(next);

  // Post blinds.
  const order = handDealOrder(next);
  const headsUp = order.length === 2;
  // Heads-up: button is the small blind. Otherwise SB is left of button.
  const sbId = headsUp ? next.buttonSeatId : order[0];
  const bbId = headsUp ? order.find((id) => id !== next.buttonSeatId)! : order[1];

  commitChips(getSeat(next, sbId), next.smallBlind);
  commitChips(getSeat(next, bbId), next.bigBlind);

  next.currentBet = next.bigBlind;
  next.minRaise = next.bigBlind;
  next.lastFullRaiseSize = next.bigBlind;
  next.lastAggressorSeatId = bbId;
  next.pots = displayPots(next);

  // First to act preflop is left of the big blind.
  next.toActSeatId = nextToAct(next, bbId);
  next.phase = 'betting';
  return next;
}

function activeCount(state: GameState): number {
  return state.seats.filter((s) => s.status === 'active').length;
}

function inHandSeats(state: GameState): Seat[] {
  return state.seats.filter((s) => s.status === 'active' || s.status === 'allin');
}

function reopenAction(state: GameState, aggressorId: number): void {
  for (const seat of state.seats) {
    if (seat.status === 'active' && seat.id !== aggressorId) {
      seat.hasActedThisStreet = false;
    }
  }
}

/** Apply a player/bot action and advance the game state. Pure. */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase !== 'betting' || state.toActSeatId === null) {
    throw new Error('No action expected right now');
  }
  if (action.seatId !== state.toActSeatId) {
    throw new Error(`Out of turn: seat ${action.seatId}, expected ${state.toActSeatId}`);
  }

  const next = clone(state);
  const seat = getSeat(next, action.seatId);
  const toCall = next.currentBet - seat.committedThisStreet;

  switch (action.type) {
    case 'fold':
      seat.status = 'folded';
      seat.hasActedThisStreet = true;
      break;

    case 'check':
      if (toCall > 0) throw new Error('Cannot check facing a bet');
      seat.hasActedThisStreet = true;
      break;

    case 'call': {
      commitChips(seat, toCall);
      seat.hasActedThisStreet = true;
      break;
    }

    case 'bet': {
      if (next.currentBet !== 0) throw new Error('Cannot bet facing a bet; raise instead');
      const target = action.amount ?? 0;
      const add = target - seat.committedThisStreet;
      commitChips(seat, add);
      const increment = target; // currentBet was 0
      next.currentBet = seat.committedThisStreet;
      next.lastFullRaiseSize = increment;
      next.minRaise = increment;
      next.lastAggressorSeatId = seat.id;
      seat.hasActedThisStreet = true;
      reopenAction(next, seat.id);
      break;
    }

    case 'raise':
    case 'allin': {
      const target =
        action.type === 'allin'
          ? seat.committedThisStreet + seat.stack
          : action.amount ?? 0;
      const add = target - seat.committedThisStreet;
      commitChips(seat, add);
      const newTotal = seat.committedThisStreet;
      const increment = newTotal - next.currentBet;
      seat.hasActedThisStreet = true;

      if (increment > 0) {
        const wasOpen = next.currentBet === 0;
        const minIncrement = wasOpen ? next.bigBlind : next.minRaise;
        const fullRaise = increment >= minIncrement;
        next.currentBet = newTotal;
        next.lastAggressorSeatId = seat.id;
        if (fullRaise) {
          next.lastFullRaiseSize = increment;
          next.minRaise = increment;
          reopenAction(next, seat.id);
        }
        // Short all-in: do not change minRaise, do not reopen action.
      }
      // increment <= 0: a short all-in call; no bet change.
      break;
    }

    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }

  next.log.push({ street: next.street, action });
  next.pots = displayPots(next);

  return progress(next, action.seatId);
}

/** After an action, either continue betting, advance street, or go to showdown. */
function progress(state: GameState, actorId: number): GameState {
  // Hand over by folds.
  if (inHandSeats(state).length <= 1) {
    return awardUncontested(state);
  }

  const next = nextToAct(state, actorId);
  if (next !== null) {
    state.toActSeatId = next;
    return state;
  }

  // Betting round closed.
  if (state.street === Street.River) {
    return goToShowdown(state);
  }

  // If at most one player can still act, run the board out without betting.
  if (activeCount(state) <= 1) {
    runOutBoard(state);
    return goToShowdown(state);
  }

  dealNextStreet(state);
  startBettingRound(state);
  return state;
}

const STREET_ORDER: Street[] = [Street.Preflop, Street.Flop, Street.Turn, Street.River];

/** Deal remaining board cards until the river (used for all-in run-outs). */
function runOutBoard(state: GameState): void {
  const riverIdx = STREET_ORDER.indexOf(Street.River);
  while (STREET_ORDER.indexOf(state.street) < riverIdx) {
    dealNextStreet(state);
  }
}

function dealNextStreet(state: GameState): void {
  const i = STREET_ORDER.indexOf(state.street);
  const nextStreet = STREET_ORDER[i + 1];
  state.street = nextStreet;
  const need = nextStreet === Street.Flop ? 3 : 1;
  for (let k = 0; k < need; k++) {
    const card = state.deck.shift();
    if (!card) throw new Error('Deck exhausted dealing board');
    state.board.push(card as Card);
  }
}

function startBettingRound(state: GameState): void {
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastFullRaiseSize = state.bigBlind;
  state.lastAggressorSeatId = null;
  for (const seat of state.seats) {
    seat.committedThisStreet = 0;
    if (seat.status === 'active') seat.hasActedThisStreet = false;
  }
  state.toActSeatId = nextToAct(state, state.buttonSeatId);
  // If nobody can act (everyone all-in), run it out to showdown.
  if (state.toActSeatId === null) {
    runOutBoard(state);
    goToShowdown(state);
  }
}

function awardUncontested(state: GameState): GameState {
  const winner = inHandSeats(state)[0];
  const total = state.seats.reduce((sum, s) => sum + s.committedTotal, 0);
  if (winner) winner.stack += total;
  state.pots = winner ? [{ amount: total, eligibleSeatIds: [winner.id] }] : [];
  state.toActSeatId = null;
  state.phase = 'handComplete';
  state.log.push({
    street: state.street,
    note: winner ? `${winner.name} wins ${total} uncontested` : 'Hand over',
  });
  return state;
}

function goToShowdown(state: GameState): GameState {
  state.street = Street.Showdown;
  state.phase = 'showdown';
  state.toActSeatId = null;
  const awards = resolveShowdown(state);
  for (const award of awards) {
    getSeat(state, award.seatId).stack += award.amount;
  }
  state.pots = computeFinalPots(awards);
  for (const award of awards) {
    const winner = getSeat(state, award.seatId);
    const rank = evaluateHand(winner.holeCards, state.board);
    state.log.push({
      street: Street.Showdown,
      note: `${winner.name} wins ${award.amount} with ${HAND_CATEGORY_LABEL[rank.category]}`,
    });
  }
  state.phase = 'handComplete';
  return state;
}

function computeFinalPots(awards: ReturnType<typeof resolveShowdown>): Pot[] {
  // Reconstruct displayed pots from awards grouped by pot index.
  const byPot = new Map<number, number>();
  for (const a of awards) byPot.set(a.potIndex, (byPot.get(a.potIndex) ?? 0) + a.amount);
  return [...byPot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, amount]) => ({ amount, eligibleSeatIds: [] as number[] }));
}
