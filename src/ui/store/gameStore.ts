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
import { beginSession, loadSession, saveSession } from './gameSession';
import { useProgressStore } from './progressStore';
import { reviewDecision, type DecisionReview } from '../../tutorial/decisionReview';

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
  decisionReview: DecisionReview | null;
  difficulty: Difficulty;
  /** True while a bot's scheduled action is pending. */
  botThinking: boolean;
  sessionSaved: boolean;
  pause: () => void;
  resume: () => void;
  setSettingsPaused: (paused: boolean) => void;
  hasTableControl: boolean;
  setTableControl: (active: boolean) => void;
  newGame: (difficulty?: Difficulty, opponent?: string) => void;
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
  const restored = loadSession();
  let session = restored?.session ?? null;
  let paused = Boolean(restored);
  let settingsPaused = false;
  function persist(game: GameState): void {
    if (!session || !get().hasTableControl) return;
    // Write the completed hand before its statistics. A crash between writes
    // replays this journal; the progress receipt makes that replay idempotent.
    const journalSaved = saveSession(session);
    if (game.phase === 'handComplete' && !session.recorded) {
      const hero = game.seats.find((s) => s.isHuman)!;
      const start = session.table.seats.find((s) => s.isHuman)!.stack;
      const completedSession = session;
      const result = useProgressStore.getState().record({ type: 'freePlayHand', netChips: hero.stack - start, handId: JSON.stringify([session.table, session.handNumber]) });
      if (typeof result === 'boolean') session.recorded = result;
      else void result.then((saved) => {
        // A completed write must not overwrite a newer hand or a new tab owner.
        if (session !== completedSession || !get().hasTableControl) return;
        completedSession.recorded = saved;
        set({ sessionSaved: saveSession(completedSession) && journalSaved && saved });
      });
    }
    set({ sessionSaved: saveSession(session) && journalSaved && (game.phase !== 'handComplete' || session.recorded) });
  }
  /** If it's a bot's turn, schedule its action; recurse until a human acts. */
  function scheduleBots(): void {
    clearBotTimer();
    if (paused || settingsPaused || !get().hasTableControl) return;
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
      session?.actions.push(action);
      set({ game: next, botThinking: false });
      persist(next);
      scheduleBots();
    }, delay);
  }

  return {
    game: restored?.game ?? null,
    decisionReview: restored?.review ?? null,
    difficulty: restored?.session.difficulty ?? 'medium',
    botThinking: false,
    sessionSaved: true,
    hasTableControl: typeof navigator === 'undefined' || !navigator.locks,
    setTableControl: (active) => {
      clearBotTimer();
      if (active && !get().hasTableControl) {
        const latest = loadSession();
        session = latest?.session ?? null;
        set({ game: latest?.game ?? null, difficulty: latest?.session.difficulty ?? get().difficulty, decisionReview: latest?.review ?? null });
        useProgressStore.getState().refresh();
      }
      set({ hasTableControl: active, botThinking: false });
      if (active) scheduleBots();
    },
    setSettingsPaused: (value) => {
      settingsPaused = value;
      clearBotTimer();
      set({ botThinking: false });
      scheduleBots();
    },
    pause: () => { paused = true; clearBotTimer(); set({ botThinking: false }); },
    resume: () => { paused = false; if (get().game) persist(get().game!); scheduleBots(); },

    newGame: (difficulty, opponent) => {
      if (!get().hasTableControl) return;
      clearBotTimer();
      const diff = difficulty ?? get().difficulty;
      // Fresh games must vary: the engine is a deterministic seeded PRNG, so a
      // constant seed replays the exact same hand forever (busting and hitting
      // NEW GAME would deal an identical board every time). Draw entropy here in
      // the UI layer — engine modules stay Math.random-free.
      const seed = (Math.floor(Math.random() * 0xffffffff) | 0) || 1;
      // A named rival starts a heads-up practice table; default remains four seats.
      const rival = DEFAULT_TABLE.seats.find((s) => !s.isHuman && s.name === opponent);
      const seats = rival ? [DEFAULT_TABLE.seats[0], rival] : DEFAULT_TABLE.seats;
      const table = createTable({ ...DEFAULT_TABLE, seats, seed });
      paused = false;
      session = beginSession(table, diff);
      set({ game: startHand(table, { buttonSeatId: DEFAULT_TABLE.buttonSeatId }), difficulty: diff, botThinking: false, decisionReview: null });
      persist(get().game!);
      scheduleBots();
    },

    dealHand: () => {
      if (!get().hasTableControl) return;
      const { game } = get();
      if (!game || game.phase !== 'handComplete') return;
      clearBotTimer();
      // Drop busted players, rotate the button, deal the next hand.
      const rotated = rotateButton(game);
      const withChips = rotated.seats.filter((s) => s.stack > 0);
      if (withChips.length < 2) return;
      session = beginSession(rotated, get().difficulty);
      set({ game: startHand(rotated), botThinking: false, decisionReview: null });
      persist(get().game!);
      scheduleBots();
    },

    playerAction: (action) => {
      const { game } = get();
      if (paused || settingsPaused || !get().hasTableControl || !game || game.toActSeatId === null) return;
      const seat = game.seats.find((s) => s.id === game.toActSeatId);
      if (!seat || !seat.isHuman) return;
      const next = applyAction(game, action);
      session?.actions.push(action);
      set({ game: next, decisionReview: reviewDecision(game, action) });
      persist(next);
      scheduleBots();
    },
  };
});
