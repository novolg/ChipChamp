import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../gameStore';

const TOTAL_CHIPS = 4000; // 4 seats × 1000

function totalStacks(): number {
  return useGameStore.getState().game!.seats.reduce((sum, s) => sum + s.stack, 0);
}

describe('gameStore orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
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
