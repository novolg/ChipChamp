import { expect, it } from 'vitest';
import { createTable, startHand, applyAction } from '../../engine/reducer';
import { reviewDecision } from '../decisionReview';
import { beginSession, restoreSession } from '../../ui/store/gameSession';

it('keeps the decision-time advice stable across result and reload', () => {
  const table = createTable({ seats: [{ id: 0, name: 'You', isHuman: true, stack: 1000 }, { id: 1, name: 'Ben', isHuman: false, stack: 1000 }], buttonSeatId: 0, smallBlind: 10, bigBlind: 20, seed: 42 });
  const game = startHand(table);
  const action = { type: 'fold' as const, seatId: 0 };
  const before = structuredClone(game);
  const review = reviewDecision(game, action);
  expect(review?.street).toBe('preflop');
  expect(review?.played).toBe('fold');
  expect(review?.reasoning.length).toBeGreaterThan(10);
  expect(game).toEqual(before);
  expect(reviewDecision(applyAction(game, action), action)).toBeNull();
  const session = beginSession(table, 'medium'); session.actions.push(action);
  expect(restoreSession(JSON.stringify(session))?.review).toEqual(review);
});
