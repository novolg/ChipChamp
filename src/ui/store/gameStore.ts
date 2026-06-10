import { create } from 'zustand';
import type { Action, GameState } from '../../engine/types';
import {
  createTable,
  startHand,
  applyAction,
  rotateButton,
  type TableConfig,
} from '../../engine/reducer';
import { decide } from '../../bot/policy';
import { BOT_PRESETS, type BotConfig } from '../../bot/botConstants';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Delay before a bot acts, so the human can follow the action. */
const BOT_DELAY_MS = 750;

export interface GameStore {
  game: GameState | null;
  difficulty: Difficulty;
  /** True while a bot's scheduled action is pending. */
  botThinking: boolean;
  newGame: (difficulty?: Difficulty) => void;
  dealHand: () => void;
  playerAction: (action: Action) => void;
}

const DEFAULT_TABLE: TableConfig = {
  seats: [
    { id: 0, name: 'You', isHuman: true, stack: 1000 },
    { id: 1, name: 'Ava', isHuman: false, stack: 1000 },
    { id: 2, name: 'Ben', isHuman: false, stack: 1000 },
    { id: 3, name: 'Cleo', isHuman: false, stack: 1000 },
  ],
  buttonSeatId: 0,
  smallBlind: 10,
  bigBlind: 20,
  seed: 1,
};

let botTimer: ReturnType<typeof setTimeout> | null = null;

function clearBotTimer(): void {
  if (botTimer !== null) {
    clearTimeout(botTimer);
    botTimer = null;
  }
}

function botConfigFor(difficulty: Difficulty): BotConfig {
  return BOT_PRESETS[difficulty];
}

export const useGameStore = create<GameStore>((set, get) => {
  /** If it's a bot's turn, schedule its action; recurse until a human acts. */
  function scheduleBots(): void {
    clearBotTimer();
    const { game } = get();
    if (!game || game.phase !== 'betting' || game.toActSeatId === null) return;
    const seat = game.seats.find((s) => s.id === game.toActSeatId);
    if (!seat || seat.isHuman) return;

    const actingSeatId = game.toActSeatId;
    set({ botThinking: true });
    botTimer = setTimeout(() => {
      botTimer = null;
      const current = get().game;
      // Bail if state moved on (e.g. a new hand was dealt).
      if (!current || current.toActSeatId !== actingSeatId || current.phase !== 'betting') {
        set({ botThinking: false });
        return;
      }
      const action = decide(current, actingSeatId, botConfigFor(get().difficulty));
      const next = applyAction(current, action);
      set({ game: next, botThinking: false });
      scheduleBots();
    }, BOT_DELAY_MS);
  }

  return {
    game: null,
    difficulty: 'medium',
    botThinking: false,

    newGame: (difficulty) => {
      clearBotTimer();
      const diff = difficulty ?? get().difficulty;
      const table = createTable(DEFAULT_TABLE);
      set({ game: startHand(table, { buttonSeatId: DEFAULT_TABLE.buttonSeatId }), difficulty: diff, botThinking: false });
      scheduleBots();
    },

    dealHand: () => {
      clearBotTimer();
      const { game } = get();
      if (!game) return;
      // Drop busted players, rotate the button, deal the next hand.
      const rotated = rotateButton(game);
      const withChips = rotated.seats.filter((s) => s.stack > 0);
      if (withChips.length < 2) return;
      set({ game: startHand(rotated), botThinking: false });
      scheduleBots();
    },

    playerAction: (action) => {
      const { game } = get();
      if (!game || game.toActSeatId === null) return;
      const seat = game.seats.find((s) => s.id === game.toActSeatId);
      if (!seat || !seat.isHuman) return;
      const next = applyAction(game, action);
      set({ game: next });
      scheduleBots();
    },
  };
});
