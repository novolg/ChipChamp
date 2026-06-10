import { describe, it, expect } from 'vitest';
import { buildScriptedGame, dealOrder } from '../practice';
import { SCRIPTED_HANDS } from '../content/scriptedHands';
import { getLegalActions } from '../../engine/betting';

describe('dealOrder', () => {
  it('starts left of the button and wraps clockwise', () => {
    expect(dealOrder([0, 1, 2], 0)).toEqual([1, 2, 0]);
    expect(dealOrder([0, 1, 2], 1)).toEqual([2, 0, 1]);
  });
});

describe('buildScriptedGame', () => {
  it('deals each scripted hand and stops with the hero to act', () => {
    for (const hand of SCRIPTED_HANDS) {
      const { game, heroId } = buildScriptedGame(hand);
      expect(game.phase).toBe('betting');
      expect(game.toActSeatId).toBe(heroId);

      // Hero holds exactly the scripted hole cards.
      const hero = game.seats.find((s) => s.id === heroId)!;
      expect(hero.holeCards).toEqual(hand.setup.holeCards[heroId]);

      // There is a checkpoint for the current street, and its recommended action is legal.
      const checkpoint = hand.checkpoints.find((c) => c.atStreet === game.street);
      expect(checkpoint).toBeDefined();
      const legalTypes = getLegalActions(game).map((a) => a.type);
      expect(legalTypes).toContain(checkpoint!.recommended);
    }
  });

  it('rebuilds an identical setup each time (deterministic)', () => {
    const a = buildScriptedGame(SCRIPTED_HANDS[0]);
    const b = buildScriptedGame(SCRIPTED_HANDS[0]);
    expect(a.game.seats.map((s) => s.holeCards)).toEqual(b.game.seats.map((s) => s.holeCards));
    expect(a.game.toActSeatId).toBe(b.game.toActSeatId);
  });
});
