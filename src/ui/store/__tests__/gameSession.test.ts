import { describe, expect, it } from 'vitest';
import { applyAction, createTable, rotateButton, startHand } from '../../../engine/reducer';
import { beginSession, restoreSession } from '../gameSession';

const table = () => createTable({ seats: [{ id: 0, name: 'You', isHuman: true, stack: 1000 }, { id: 2, name: 'Ben', isHuman: false, stack: 1000 }], buttonSeatId: 0, smallBlind: 10, bigBlind: 20, seed: 987 });
describe('table session replay', () => {
  it('restores identical cards, turn, stacks and deck mid-hand', () => {
    const initial = table();
    const session = beginSession(initial, 'hard');
    const action = { type: 'call' as const, seatId: 0 };
    session.actions.push(action);
    const live = applyAction(startHand(initial), action);
    expect(restoreSession(JSON.stringify(session))?.game).toEqual(live);
  });
  it('restores completed results and the next hand with a rotated button', () => {
    const initial = table();
    const session = beginSession(initial, 'medium');
    session.actions.push({ type: 'fold', seatId: 0 });
    session.recorded = true;
    const final = applyAction(startHand(initial), session.actions[0]);
    expect(restoreSession(JSON.stringify(session))?.game).toEqual(final);
    const rotated = rotateButton(final);
    const next = beginSession(rotated, 'medium');
    expect(restoreSession(JSON.stringify(next))?.game).toEqual(startHand(rotated));
  });
  it('rejects malformed, incompatible and illegal saved games', () => {
    expect(restoreSession('{broken')).toBeNull();
    expect(restoreSession('null')).toBeNull();
    const session = beginSession(table(), 'medium');
    expect(restoreSession(JSON.stringify({ ...session, version: 2 }))).toBeNull();
    expect(restoreSession(JSON.stringify({ ...session, recorded: true }))).toBeNull();
    expect(restoreSession(JSON.stringify({ ...session, actions: [{ type: 'check', seatId: 0 }] }))).toBeNull();
    expect(restoreSession(JSON.stringify({ ...session, actions: [{ type: 'raise', seatId: 0, amount: -3 }] }))).toBeNull();
    session.table.seats[0].stack = 1000000;
    expect(restoreSession(JSON.stringify(session))).toBeNull();
  });
});
