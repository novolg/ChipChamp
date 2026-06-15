import { useEffect, useRef, useState } from 'react';
import type { Emotion } from '../lib/botEmotion';
import type { GameState } from '../../engine/types';

/** Felt slot a bot occupies (hero is the bottom human seat). */
export type Slot = 'left' | 'center' | 'right' | 'hero';
/** Where a bot's gaze points. `forward` = neutral, eyes/head centered. */
export type GazeTarget = 'forward' | 'left' | 'center' | 'right' | 'hero' | 'pot';
/** Resolved eye offset (px) + head tilt (deg). Eyes use {x,y}; head uses tilt + a fraction of x. */
export interface GazeVec { x: number; y: number; tilt: number; }
/** Per-seat director output. */
export interface GazeState { target: GazeTarget; expressionOverride?: Emotion; }

/** Taste budget: eyes ≈ ±2.5px, head ≈ ±2.5°. A hand-tuned lookup, not live math.
 *  Screen layout: left/center/right bots arc across the top; hero bottom-center;
 *  pot center-middle. A seat looking at itself is `forward`. */
const Z: GazeVec = { x: 0, y: 0, tilt: 0 };
const GAZE_VECTOR: Record<'left' | 'center' | 'right', Record<GazeTarget, GazeVec>> = {
  left: {
    forward: Z,
    left: Z, // self
    center: { x: 2.5, y: -0.5, tilt: 2 },
    right: { x: 2.5, y: 0, tilt: 2.5 },
    hero: { x: 1.2, y: 2.2, tilt: 1 },
    pot: { x: 1, y: 2, tilt: 1 },
  },
  center: {
    forward: Z,
    center: Z, // self
    left: { x: -2.5, y: 1, tilt: -2.5 },
    right: { x: 2.5, y: 1, tilt: 2.5 },
    hero: { x: 0, y: 2.5, tilt: 0 },
    pot: { x: 0, y: 2.2, tilt: 0 },
  },
  right: {
    forward: Z,
    right: Z, // self
    center: { x: -2.5, y: -0.5, tilt: -2 },
    left: { x: -2.5, y: 0, tilt: -2.5 },
    hero: { x: -1.2, y: 2.2, tilt: -1 },
    pot: { x: -1, y: 2, tilt: -1 },
  },
};

/** Pure lookup: resolve a (slot, target) pair to an eye/head offset. */
export function gazeVector(from: Slot, target: GazeTarget): GazeVec {
  if (from === 'hero') return Z; // hero has no BotFace; defensive
  return GAZE_VECTOR[from][target] ?? Z;
}

/** Pure ambient choice: ~40% of the time glance at a peer (selected by `rand`),
 *  otherwise idle `forward`. `rand` ∈ [0,1) is injected so this stays testable. */
export function pickAmbientTarget(_from: Slot, peers: GazeTarget[], rand: number): GazeTarget {
  if (peers.length > 0 && rand < 0.4) {
    const idx = Math.min(Math.floor((rand / 0.4) * peers.length), peers.length - 1);
    return peers[idx];
  }
  return 'forward';
}

export interface BigMoment { seatId: number; }

/** Pure event diff between two game states: a newly-detected all-in, or a
 *  bet/raise ≥ 0.75× the pot it is betting into (the pot before the action).
 *  Returns the acting seat, or null. */
export function detectBigMoment(prev: GameState | null, next: GameState): BigMoment | null {
  if (!prev) return null;
  const allInOf = (g: GameState) => g.seats.filter((s) => s.status === 'allin').length;
  const last = next.log[next.log.length - 1];
  const a = last?.action;
  if (allInOf(next) > allInOf(prev) && a) return { seatId: a.seatId };
  if (next.log.length > prev.log.length && a && (a.type === 'bet' || a.type === 'raise') && a.amount) {
    const potBefore = prev.pots.reduce((s, p) => s + p.amount, 0);
    if (potBefore > 0 && a.amount >= 0.75 * potBefore) return { seatId: a.seatId };
  }
  return null;
}

const EMPTY: Map<number, GazeState> = new Map();
const SLOTS: Slot[] = ['left', 'center', 'right'];

function gazeMapsEqual(a: Map<number, GazeState>, b: Map<number, GazeState>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, sa] of a) {
    const sb = b.get(id);
    if (!sb || sb.target !== sa.target || sb.expressionOverride !== sa.expressionOverride) return false;
  }
  return true;
}

const WATCH_DELAY_MS = 250; // beat before idle bots turn to the new actor
const FOCUS_MS = 1200; // big-moment / watch-actor hold
const RELIEF_MS = 900; // transient exhale after pressure resolves
const AMBIENT_MS = 600; // ambient tick

/** True when the user prefers reduced motion (SSR-safe, reactive). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Cosmetic gaze + ambient director. Returns a per-seat gaze target and an
 * optional transient expression override. The ONLY stateful/timed/Math.random
 * unit in the face system; strictly cosmetic — never affects engine/replay.
 * Fully disabled under prefers-reduced-motion (returns an empty map, no timers).
 */
export function useGazeDirector(game: GameState): Map<number, GazeState> {
  const reduced = usePrefersReducedMotion();
  const [map, setMap] = useState<Map<number, GazeState>>(EMPTY);

  // Bots, in felt order (left/center/right). Hero excluded.
  const bots = game.seats.filter((s) => !s.isHuman).slice(0, 3);
  const slotOf = new Map<number, Slot>(bots.map((s, i) => [s.id, SLOTS[i]]));
  const idleable = (id: number) => {
    const s = game.seats.find((x) => x.id === id);
    return !!s && (s.status === 'active' || s.status === 'allin');
  };

  // Shared "everyone look here" focus (big moment / actor), with expiry.
  const focus = useRef<{ target: GazeTarget; until: number; exceptSeat?: number }>({ target: 'forward', until: 0 });
  // Per-seat relief overrides, with expiry.
  const relief = useRef<Map<number, number>>(new Map());
  const prevGame = useRef<GameState | null>(null);
  const prevToAct = useRef<number | null>(null);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slotForSeat = (seatId: number | null | undefined): GazeTarget => {
    if (seatId == null) return 'pot';
    const hero = game.seats.find((s) => s.isHuman);
    if (hero && hero.id === seatId) return 'hero';
    return slotOf.get(seatId) ?? 'pot';
  };

  // Recompute the gaze map from current focus/relief state + a fresh ambient roll.
  const recompute = () => {
    const now = Date.now();
    const next = new Map<number, GazeState>();
    const peerTargets = (selfSlot: Slot): GazeTarget[] =>
      bots.map((b) => slotOf.get(b.id)!).filter((sl) => sl !== selfSlot) as GazeTarget[];
    for (const bot of bots) {
      const sl = slotOf.get(bot.id)!;
      let target: GazeTarget = 'forward';
      if (focus.current.until > now && focus.current.exceptSeat !== bot.id && idleable(bot.id)) {
        target = focus.current.target;
      } else if (idleable(bot.id)) {
        target = pickAmbientTarget(sl, peerTargets(sl), Math.random());
      }
      const reliefUntil = relief.current.get(bot.id) ?? 0;
      const expressionOverride = reliefUntil > now ? ('relief' as Emotion) : undefined;
      next.set(bot.id, { target, expressionOverride });
    }
    setMap((prev) => (gazeMapsEqual(prev, next) ? prev : next));
  };

  const recomputeRef = useRef(recompute);
  recomputeRef.current = recompute;

  // Event detection on each game change (big moment, actor change, relief).
  useEffect(() => {
    if (reduced) { setMap(EMPTY); return; }
    const prev = prevGame.current;
    const now = Date.now();

    const big = detectBigMoment(prev, game);
    if (big) {
      focus.current = { target: slotForSeat(big.seatId), until: now + FOCUS_MS, exceptSeat: big.seatId };
    }

    // Watch-the-actor: when the acting seat changes, after a beat the idle bots
    // turn toward it. A bot never watches itself (exceptSeat).
    if (game.toActSeatId !== prevToAct.current && game.phase === 'betting' && game.toActSeatId != null) {
      const actor = game.toActSeatId;
      if (watchTimer.current) clearTimeout(watchTimer.current);
      watchTimer.current = setTimeout(() => {
        focus.current = { target: slotForSeat(actor), until: Date.now() + FOCUS_MS, exceptSeat: actor };
        recomputeRef.current();
      }, WATCH_DELAY_MS);
    }

    // Relief: a bot that was facing pressure (owed > 0) and now owes nothing on
    // a fresh street gets a brief exhale.
    if (prev) {
      for (const bot of bots) {
        const before = prev.seats.find((s) => s.id === bot.id);
        const after = game.seats.find((s) => s.id === bot.id);
        if (!before || !after || after.status !== 'active') continue;
        const wasPressured = prev.currentBet - before.committedThisStreet > 0;
        const nowClear = game.currentBet - after.committedThisStreet === 0;
        if (wasPressured && nowClear && game.street !== prev.street) {
          relief.current.set(bot.id, now + RELIEF_MS);
        }
      }
    }

    prevToAct.current = game.toActSeatId;
    prevGame.current = game;
    recompute();
    return () => { if (watchTimer.current) clearTimeout(watchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, reduced]);

  // Ambient tick — paused while the tab is hidden (mirrors SuitField).
  useEffect(() => {
    if (reduced) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(() => recomputeRef.current(), AMBIENT_MS); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      if (watchTimer.current) clearTimeout(watchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return reduced ? EMPTY : map;
}
