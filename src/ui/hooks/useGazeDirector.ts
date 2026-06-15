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
