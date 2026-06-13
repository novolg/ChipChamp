import { useEffect, useRef } from 'react';
import type { ActionType, GameState } from '../../engine/types';
import { playSfx, type SfxName } from '../lib/sound';

/* Watches game state and fires SFX for the moments that matter: new deals,
 * each player action, community cards landing, the player's turn, and payout.
 * Purely observational — diffs against the previous snapshot, so it survives
 * StrictMode double-invokes (same snapshot → no double sound) and remounts
 * (first observation syncs silently). */

// postBlind is intentionally absent: blinds are committed directly in
// startHand() and never appear as action log entries, so they're unreachable here.
const ACTION_SFX: Partial<Record<ActionType, SfxName>> = {
  fold: 'fold',
  check: 'check',
  call: 'call',
  bet: 'bet',
  raise: 'raise',
  allin: 'allin',
};

interface Snap {
  hand: number;
  logLen: number;
  boardLen: number;
  phase: string;
  toAct: number | null;
}

const heroWon = (game: GameState): boolean =>
  game.log.some((e) => /^You wins /.test(e.note ?? ''));

const heroToAct = (game: GameState): boolean =>
  game.phase === 'betting' &&
  game.toActSeatId != null &&
  game.seats.find((s) => s.isHuman)?.id === game.toActSeatId;

export function useTableSfx(game: GameState | null): void {
  const prevRef = useRef<Snap | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Schedule a cue and self-remove its id once it fires, so the pending list
  // stays bounded over a long session (the unmount cleanup clears any leftovers).
  // Mutate the array in place — never reassign — so the cleanup's captured
  // reference stays valid.
  const schedule = (name: SfxName, delay: number) => {
    const id = setTimeout(() => {
      const i = timers.current.indexOf(id);
      if (i !== -1) timers.current.splice(i, 1);
      playSfx(name);
    }, delay);
    timers.current.push(id);
  };

  // A short flurry of card flicks — used for deals and streets.
  const flicks = (count: number, step = 70) => {
    for (let i = 0; i < count; i++) schedule('cardDeal', i * step);
  };
  const clinks = (count: number, step = 90) => {
    for (let i = 0; i < count; i++) schedule('chipClink', 120 + i * step);
  };

  useEffect(() => {
    if (!game) return;
    const prev = prevRef.current;
    const snap: Snap = {
      hand: game.handNumber,
      logLen: game.log.length,
      boardLen: game.board.length,
      phase: game.phase,
      toAct: game.toActSeatId,
    };

    // First observation (mount/nav): sync silently, react only to changes.
    if (!prev) {
      prevRef.current = snap;
      return;
    }

    // New hand — fresh deal. Resync the baseline to the new hand's state so the
    // next snapshot diffs cleanly (the log was reset by startHand), then return.
    if (snap.hand !== prev.hand) {
      flicks(3);
      prevRef.current = snap;
      return;
    }

    // Community cards landing (flop = 3, turn/river = 1).
    if (snap.boardLen > prev.boardLen) flicks(snap.boardLen - prev.boardLen);

    // Each new log entry's action gets its verb cue.
    if (snap.logLen > prev.logLen) {
      for (let i = prev.logLen; i < snap.logLen; i++) {
        const a = game.log[i]?.action;
        const sfx = a && ACTION_SFX[a.type];
        if (sfx) playSfx(sfx);
      }
    }

    // Payout — win sting for the hero, a quiet rake otherwise (no sad trombone).
    if (snap.phase === 'handComplete' && prev.phase !== 'handComplete') {
      if (heroWon(game)) {
        playSfx('win');
        clinks(3);
      } else {
        clinks(2);
      }
    }

    // The player's turn just began — a gentle prompt (slightly delayed so it
    // reads as distinct from the preceding bot action cue).
    if (snap.toAct !== prev.toAct && heroToAct(game)) {
      schedule('yourTurn', 140);
    }

    prevRef.current = snap;
  }, [game]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
}
