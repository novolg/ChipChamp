import { describe, it, expect } from 'vitest';
import { buildScriptedGame, dealOrder, submitPracticeDecision } from '../practice';
import { SCRIPTED_HANDS } from '../content/scriptedHands';
import { getLegalActions } from '../../engine/betting';

describe('practice decisions change the actual table', () => {
  const foldHand = SCRIPTED_HANDS.find((h) => h.id === 'practice-fold-trash')!;
  const raiseHand = SCRIPTED_HANDS.find((h) => h.id === 'practice-raise-premium')!;

  it('folds the hero and preserves the original snapshot for replay', () => {
    const state = buildScriptedGame(foldHand);
    const decision = submitPracticeDecision(foldHand, state, { type: 'fold', seatId: state.heroId });
    expect(decision.correct).toBe(true);
    expect(decision.state.game.seats.find((s) => s.id === state.heroId)?.status).toBe('folded');
    expect(state.game.seats.find((s) => s.id === state.heroId)?.status).toBe('active');
    expect(decision.chipsCommitted).toBe(0);
    expect(decision.stackAfter).toBe(decision.stackBefore);
  });

  it('raises chips into the pot and pauses before a bot acts', () => {
    const state = buildScriptedGame(raiseHand);
    const amount = getLegalActions(state.game).find((a) => a.type === 'raise')!.min!;
    const decision = submitPracticeDecision(raiseHand, state, { type: 'raise', seatId: state.heroId, amount });
    expect(decision.correct).toBe(true);
    expect(decision.state.game.currentBet).toBe(amount);
    expect(decision.chipsCommitted).toBe(amount);
    expect(decision.stackAfter).toBe(decision.stackBefore - amount);
    expect(decision.state.game.log.length).toBe(state.game.log.length + 1);
    expect(decision.state.game.toActSeatId).not.toBe(state.heroId);
    expect(decision.state.game.pots.reduce((n, p) => n + p.amount, 0)).toBe(30 + amount);
  });

  it('shows the cost of a wrong call and can rebuild the exact starting spot', () => {
    const state = buildScriptedGame(foldHand);
    const decision = submitPracticeDecision(foldHand, state, { type: 'call', seatId: state.heroId });
    expect(decision.correct).toBe(false);
    expect(decision.chipsCommitted).toBe(20);
    expect(decision.explanation).toBe(foldHand.checkpoints[0].explainWrong);
    expect(buildScriptedGame(foldHand)).toEqual(state);
  });

  it('supports the allowed all-in without evaluating an unseen runout', () => {
    const state = buildScriptedGame(raiseHand);
    const decision = submitPracticeDecision(raiseHand, state, { type: 'allin', seatId: state.heroId });
    expect(decision.correct).toBe(true);
    expect(decision.stackAfter).toBe(0);
    expect(decision.state.game.board).toHaveLength(0);
  });

  it('rejects wrong actors and illegal moves without mutating the setup', () => {
    const state = buildScriptedGame(raiseHand);
    const snapshot = JSON.stringify(state);
    expect(() => submitPracticeDecision(raiseHand, state, { type: 'fold', seatId: 1 })).toThrow();
    expect(() => submitPracticeDecision(raiseHand, state, { type: 'raise', seatId: state.heroId, amount: 1 })).toThrow();
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

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
