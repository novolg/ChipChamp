import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../gameStore';
import { useProgressStore } from '../progressStore';

const TOTAL_CHIPS = 4000; // 4 seats × 1000

function totalStacks(): number {
  return useGameStore.getState().game!.seats.reduce((sum, s) => sum + s.stack, 0);
}

describe('gameStore orchestration', () => {
  it('does not mutate the table without tab ownership', () => {
    useGameStore.getState().newGame('medium', 'Ben');
    useGameStore.getState().setTableControl(false);
    const before = useGameStore.getState().game;
    useGameStore.getState().playerAction({ type: 'fold', seatId: 0 });
    useGameStore.getState().newGame();
    useGameStore.getState().dealHand();
    expect(useGameStore.getState().game).toBe(before);
    useGameStore.getState().setTableControl(true);
  });
  it('keeps settings and screen pauses independent', () => {
    useGameStore.getState().newGame('medium', 'Ben');
    useGameStore.getState().playerAction({ type: 'call', seatId: 0 });
    const before = useGameStore.getState().game;
    useGameStore.getState().setSettingsPaused(true);
    useGameStore.getState().resume(); // returning to a visible tab must not bypass the modal
    vi.advanceTimersByTime(10000);
    expect(useGameStore.getState().game).toBe(before);
    expect(useGameStore.getState().botThinking).toBe(false);
    useGameStore.getState().pause();
    useGameStore.getState().setSettingsPaused(false);
    expect(vi.getTimerCount()).toBe(0);
    useGameStore.getState().resume();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(useGameStore.getState().game).not.toBe(before);
    useGameStore.getState().pause();
  });
  it('ignores player actions while settings cover the table', () => {
    useGameStore.getState().newGame('medium', 'Ben');
    const before = useGameStore.getState().game;
    useGameStore.getState().setSettingsPaused(true);
    useGameStore.getState().playerAction({ type: 'fold', seatId: 0 });
    expect(useGameStore.getState().game).toBe(before);
    useGameStore.getState().setSettingsPaused(false);
  });
  it('records a completed hand once even after repeated resume', () => {
    const before = useProgressStore.getState().progress.freePlayStats;
    useGameStore.getState().newGame('medium', 'Ben');
    useGameStore.getState().playerAction({ type: 'fold', seatId: 0 });
    useGameStore.getState().pause();
    useGameStore.getState().resume();
    useGameStore.getState().resume();
    const after = useProgressStore.getState().progress.freePlayStats;
    expect(after.handsPlayed).toBe(before.handsPlayed + 1);
    expect(after.netChips).toBe(before.netChips - 10);
  });
  it('pauses pending bot actions and resumes only one timer', () => {
    vi.useFakeTimers();
    useGameStore.getState().newGame('medium', 'Ben');
    useGameStore.getState().playerAction({ type: 'call', seatId: 0 });
    const before = useGameStore.getState().game;
    useGameStore.getState().pause();
    vi.advanceTimersByTime(10000);
    expect(useGameStore.getState().game).toBe(before);
    expect(useGameStore.getState().botThinking).toBe(false);
    useGameStore.getState().resume();
    useGameStore.getState().resume();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(useGameStore.getState().game).not.toBe(before);
    useGameStore.getState().pause();
  });
  it('cannot redeal an unfinished hand', () => {
    useGameStore.getState().newGame('medium', 'Ben');
    const before = useGameStore.getState().game;
    useGameStore.getState().dealHand();
    expect(useGameStore.getState().game).toBe(before);
  });
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(['Ava', 'Ben', 'Cleo'])('plays a heads-up hand against %s and returns to a full table', (name) => {
    useGameStore.getState().newGame('hard', name);
    const start = useGameStore.getState().game!;
    expect(start.seats.map((s) => s.name)).toEqual(['You', name]);
    expect(useGameStore.getState().difficulty).toBe('hard');
    for (let i = 0; i < 100; i++) {
      const game = useGameStore.getState().game!;
      if (game.phase !== 'betting') break;
      if (game.toActSeatId === 0) useGameStore.getState().playerAction({ type: 'fold', seatId: 0 });
      else vi.advanceTimersByTime(2000);
    }
    expect(useGameStore.getState().game!.phase).toBe('handComplete');
    expect(totalStacks()).toBe(2000);
    useGameStore.getState().dealHand();
    expect(useGameStore.getState().game!.seats.map((s) => s.name)).toEqual(['You', name]);
    expect(useGameStore.getState().game!.buttonSeatId).not.toBe(start.buttonSeatId);
    useGameStore.getState().newGame('medium');
    expect(useGameStore.getState().game!.seats).toHaveLength(4);
  });

  it('deals a hand with blinds posted and hero holding two cards', () => {
    useGameStore.getState().newGame('medium');
    const game = useGameStore.getState().game!;
    const hero = game.seats.find((s) => s.isHuman)!;
    expect(hero.holeCards).toHaveLength(2);
    expect(game.pots[0].amount).toBe(30); // SB 10 + BB 20
  });

  it('plays a full hand to completion with chips conserved (hero folds)', () => {
    useGameStore.getState().newGame('medium');

    for (let i = 0; i < 100; i++) {
      const game = useGameStore.getState().game!;
      if (game.phase !== 'betting') break;
      const hero = game.seats.find((s) => s.isHuman)!;
      if (game.toActSeatId === hero.id) {
        useGameStore.getState().playerAction({ type: 'fold', seatId: hero.id });
      } else {
        // Let pending bot actions fire.
        vi.advanceTimersByTime(800);
      }
    }

    const game = useGameStore.getState().game!;
    expect(game.phase).toBe('handComplete');
    expect(totalStacks()).toBe(TOTAL_CHIPS); // no chips created or destroyed
  });

  it('ignores player actions when it is not the hero’s turn', () => {
    useGameStore.getState().newGame('medium');
    const before = useGameStore.getState().game!;
    // Seat 1 is a bot; acting as it should be a no-op.
    useGameStore.getState().playerAction({ type: 'fold', seatId: 1 });
    expect(useGameStore.getState().game).toBe(before);
  });

  it('deals consecutive hands, rotating the button, chips conserved each time', () => {
    useGameStore.getState().newGame('medium');
    const firstButton = useGameStore.getState().game!.buttonSeatId;

    const playOut = () => {
      for (let i = 0; i < 100; i++) {
        const game = useGameStore.getState().game!;
        if (game.phase !== 'betting') break;
        const hero = game.seats.find((s) => s.isHuman)!;
        if (game.toActSeatId === hero.id) {
          useGameStore.getState().playerAction({ type: 'fold', seatId: hero.id });
        } else {
          vi.advanceTimersByTime(800);
        }
      }
    };

    playOut();
    expect(totalStacks()).toBe(TOTAL_CHIPS);
    useGameStore.getState().dealHand();
    expect(useGameStore.getState().game!.buttonSeatId).not.toBe(firstButton);
    playOut();
    expect(totalStacks()).toBe(TOTAL_CHIPS);
  });
});
