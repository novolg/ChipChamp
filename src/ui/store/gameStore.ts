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
import { useSettingsStore } from './settingsStore';
import { RITUAL_MS } from '../../feel/recipes';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Delay before a bot acts, so the human can follow the action. Exported so the
 *  table's timebank arc can drain over exactly this window. */
export const BOT_DELAY_MS = 750;

/** Scene deal-ritual length at 1× (spec §2). Sourced from feel/recipes so the
 *  gameStore's first-action gate and the HAND_START recipe's `dealRitual` param
 *  can never drift apart; re-exported under the store's own name for callers
 *  that shouldn't reach into src/feel. */
export const DEAL_RITUAL_MS = RITUAL_MS;

export interface GameStore {
  game: GameState | null;
  difficulty: Difficulty;
  /** True while a bot's scheduled action is pending. */
  botThinking: boolean;
  newGame: (difficulty?: Difficulty) => void;
  dealHand: () => void;
  playerAction: (action: Action) => void;
}

/** Hero's stack before the first deal — the HUD balance shows this while
 *  `game === null` (src/ui/lib/derive.ts `heroChipBalance`). */
export const HERO_STARTING_STACK = 1000;

const DEFAULT_TABLE: TableConfig = {
  seats: [
    { id: 0, name: 'You', isHuman: true, stack: HERO_STARTING_STACK },
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

    // Speed scales every bot delay (UI-layer read; the engine stays untouched).
    // The FIRST bot action of a hand additionally waits out the scene's deal
    // ritual so the bot doesn't act over the cards still flying in — "first
    // action" = no non-blind action has been logged yet this hand.
    const { speed } = useSettingsStore.getState().settings;
    const firstActionOfHand = game.log.every((e) => !e.action || e.action.type === 'postBlind');
    const delay = BOT_DELAY_MS / speed + (firstActionOfHand ? DEAL_RITUAL_MS / speed : 0);

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
    }, delay);
  }

  return {
    game: null,
    difficulty: 'medium',
    botThinking: false,

    newGame: (difficulty) => {
      clearBotTimer();
      const diff = difficulty ?? get().difficulty;
      // Fresh games must vary: the engine is a deterministic seeded PRNG, so a
      // constant seed replays the exact same hand forever (busting and hitting
      // NEW GAME would deal an identical board every time). Draw entropy here in
      // the UI layer — engine modules stay Math.random-free.
      const seed = (Math.floor(Math.random() * 0xffffffff) | 0) || 1;
      const table = createTable({ ...DEFAULT_TABLE, seed });
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
