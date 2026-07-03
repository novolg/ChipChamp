// Camera rig (wow layer 2): named framings, exponentially-damped moves, a
// decaying shake with a hint of roll, a zoom punch, and a hit-stop that
// freezes the scene ticker for a beat. `framingFor` + `damp` are pure math
// (unit-tested in node); `CameraRig` only manipulates the injected `world`
// Container and ticker, so this module never imports Pixi at runtime
// (type-only imports — vitest runs in node with no Pixi).

import type { Container, Ticker } from 'pixi.js';
import type { SeatSlot, TableLayout } from './layout';

export interface CamState {
  x: number;
  y: number;
  zoom: number;
}

export type FramingName = 'default' | `seat:${SeatSlot}` | 'pot';

/** Live motion flags the rig reads on every call/frame (DYNAMIC — a settings
 *  toggle can flip reduced motion mid-session). `CardMotion` satisfies this
 *  structurally, so PokerScene hands its shared motion object straight through
 *  (same idiom as FeltActor's `FeltMotion`). */
export interface CamMotion {
  reducedMotion(): boolean;
}

const SEAT_ZOOM = 1.03;
const POT_ZOOM = 1.02;
/** Fraction of (felt center − anchor) the camera travels toward a framing. */
const PULL = 0.35;
const DEFAULT_HALF_LIFE_MS = 180;

/** Peak shake roll at full decay envelope, per the brief (±0.004 rad). */
const SHAKE_ROT_RAD = 0.004;
/* Deterministic shake noise: three incommensurate sin/cos frequencies
 * (rad per ms of shake-elapsed time) so x / y / roll never sync up into a
 * clean orbit — no RNG, replay-stable (mirrors playConfetti's idiom). */
const SHAKE_FREQ_X = 0.12; // ~19Hz
const SHAKE_FREQ_Y = 0.1;
const SHAKE_FREQ_ROT = 0.15;
const SHAKE_PHASE_Y = 1.7;
const SHAKE_PHASE_ROT = 0.5;

/** The camera translation/zoom for a named framing, from layout geometry.
 *  `default` is the identity; seat/pot framings pull the world PULL of the
 *  way from the anchor toward the felt center (so the anchor drifts inward)
 *  at a subtle zoom. Pure — safe for node tests. */
export function framingFor(name: FramingName, L: TableLayout): CamState {
  if (name === 'default') return { x: 0, y: 0, zoom: 1 };
  const anchor = name === 'pot' ? L.pot : L.seatCards[name.slice('seat:'.length) as SeatSlot];
  return {
    x: PULL * (L.felt.cx - anchor.x),
    y: PULL * (L.felt.cy - anchor.y),
    zoom: name === 'pot' ? POT_ZOOM : SEAT_ZOOM,
  };
}

/** One step of frame-rate-independent exponential smoothing: after every
 *  `halfLife` ms of accumulated dt the remaining gap to `target` halves,
 *  regardless of step size (two 8ms steps land exactly where one 16ms step
 *  does). Pure — returns a new state. */
export function damp(
  current: CamState,
  target: CamState,
  dt: number,
  halfLife = DEFAULT_HALF_LIFE_MS,
): CamState {
  const k = 1 - Math.pow(0.5, dt / halfLife);
  return {
    x: current.x + (target.x - current.x) * k,
    y: current.y + (target.y - current.y) * k,
    zoom: current.zoom + (target.zoom - current.zoom) * k,
  };
}

/** A transient, tick-driven effect: elapsed advances only while the ticker
 *  runs, so a hit-stop naturally freezes shake/punch mid-flight. */
interface Transient {
  elapsedMs: number;
  totalMs: number;
  amount: number; // shake: px amplitude · punch: extra zoom
}

/**
 * CameraRig — the ONLY transform writer on the injected `world` container
 * (env parallax stays outside it). Zooms pivot about the felt center; `tick`
 * (driven by the shared app ticker, ms deltas) damps toward the current
 * framing target and layers the shake/punch offsets on top. Reduced motion is
 * read live: `goTo` snaps, `shake`/`punch`/`hitStop` no-op, and any residual
 * transient is zeroed on the next tick (or immediately via `snap()`).
 */
export class CameraRig {
  private readonly world: Container;
  private readonly motion: CamMotion;
  private readonly ticker: Ticker;
  private L: TableLayout;

  private target: CamState = { x: 0, y: 0, zoom: 1 };
  private state: CamState = { x: 0, y: 0, zoom: 1 };
  /** In-flight shake/punch (kill-before-reassign: a new one replaces the old). */
  private shakeFx: Transient | null = null;
  private punchFx: Transient | null = null;
  /** Pending hit-stop restart. Non-null ⇔ we stopped the ticker and owe it a
   *  start. Cleared (without restarting) only in destroy(). */
  private hitStopTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(world: Container, L: TableLayout, motion: CamMotion, ticker: Ticker) {
    this.world = world;
    this.L = L;
    this.motion = motion;
    this.ticker = ticker;
    this.world.pivot.set(L.felt.cx, L.felt.cy);
    this.ticker.add(this.onTick);
    this.apply(0, 0, 0, 0);
  }

  /** Retarget the damped move. Under reduced motion the camera snaps there
   *  instead (and clears any transient offsets so nothing lingers). */
  goTo(name: FramingName): void {
    this.target = framingFor(name, this.L);
    if (this.motion.reducedMotion()) this.snap();
  }

  /** Decaying deterministic noise on position (+ a ±0.004rad roll), `ms` long.
   *  Replaces any shake already in flight. No-op under reduced motion. */
  shake(amplitude: number, ms: number): void {
    if (this.motion.reducedMotion() || amplitude <= 0 || ms <= 0) return;
    this.shakeFx = { elapsedMs: 0, totalMs: ms, amount: amplitude };
  }

  /** An instant `dz` zoom pop that eases back out over `ms` (the camPunch
   *  beat). Replaces any punch already in flight. No-op under reduced motion. */
  punch(dz: number, ms: number): void {
    if (this.motion.reducedMotion() || ms <= 0) return;
    this.punchFx = { elapsedMs: 0, totalMs: ms, amount: dz };
  }

  /** Freeze the scene for `ms` by stopping the shared app ticker (GSAP's own
   *  ticker keeps running — ambient tweens advance in wall time but don't
   *  render; intended). Restart via wall-clock timer, cleared in destroy() so
   *  a dead scene never restarts a destroyed ticker. Overlap policy: a new
   *  hitStop while one is active is IGNORED (the first freeze wins — punches
   *  can't chain-freeze the table). No-op under reduced motion. */
  hitStop(ms: number): void {
    if (this.motion.reducedMotion() || this.destroyed || ms <= 0) return;
    if (this.hitStopTimer !== null) return;
    this.ticker.stop();
    this.hitStopTimer = setTimeout(() => {
      this.hitStopTimer = null;
      if (!this.destroyed) this.ticker.start();
    }, ms);
  }

  /** Advance the damped move + transient offsets by `dt` ms and write the
   *  world transform. Under reduced motion: hard-snap to target, drop any
   *  transient (a mid-shake settings flip leaves no residual offset). */
  tick(dt: number): void {
    if (this.motion.reducedMotion()) {
      this.shakeFx = null;
      this.punchFx = null;
      this.state = { ...this.target };
      this.apply(0, 0, 0, 0);
      return;
    }
    this.state = damp(this.state, this.target, dt);

    let extraZoom = 0;
    if (this.punchFx) {
      this.punchFx.elapsedMs += dt;
      const p = this.punchFx.elapsedMs / this.punchFx.totalMs;
      if (p >= 1) this.punchFx = null;
      else extraZoom = this.punchFx.amount * (1 - p); // full pop, linear release
    }

    let sx = 0;
    let sy = 0;
    let rot = 0;
    if (this.shakeFx) {
      this.shakeFx.elapsedMs += dt;
      const t = this.shakeFx.elapsedMs;
      const p = t / this.shakeFx.totalMs;
      if (p >= 1) this.shakeFx = null;
      else {
        const decay = (1 - p) * (1 - p);
        sx = this.shakeFx.amount * decay * Math.sin(t * SHAKE_FREQ_X);
        sy = this.shakeFx.amount * decay * Math.cos(t * SHAKE_FREQ_Y + SHAKE_PHASE_Y);
        rot = SHAKE_ROT_RAD * decay * Math.sin(t * SHAKE_FREQ_ROT + SHAKE_PHASE_ROT);
      }
    }

    this.apply(extraZoom, sx, sy, rot);
  }

  /** Snap to the CURRENT target and drop every transient (shake/punch gone,
   *  an in-flight hit-stop ends now). Called by PokerScene.setMotion the
   *  instant reduced motion turns on — same discipline as T12 zeroing the env
   *  parallax — so nothing waits for a next frame that a stopped ticker might
   *  never deliver. */
  snap(): void {
    this.shakeFx = null;
    this.punchFx = null;
    this.cancelHitStop();
    this.state = { ...this.target };
    this.apply(0, 0, 0, 0);
  }

  /** Hard-return to the default framing (no tween) and clear every transient. */
  reset(): void {
    this.target = framingFor('default', this.L);
    this.snap();
  }

  /** Adopt a new layout (landscape↔portrait swap) and snap to default — the
   *  old framings' coordinates are stale, so nothing tweens across the swap. */
  relayout(L: TableLayout): void {
    this.L = L;
    this.world.pivot.set(L.felt.cx, L.felt.cy);
    this.reset();
  }

  /** Detach from the ticker and clear the hit-stop restart timer WITHOUT
   *  restarting the ticker (the app owning it is being torn down). Called
   *  once by PokerScene.destroy(). */
  destroy(): void {
    this.destroyed = true;
    this.ticker.remove(this.onTick);
    if (this.hitStopTimer !== null) {
      clearTimeout(this.hitStopTimer);
      this.hitStopTimer = null;
    }
  }

  /** End an in-flight hit-stop immediately (clear the timer AND restart the
   *  ticker we stopped — never strand it). */
  private cancelHitStop(): void {
    if (this.hitStopTimer === null) return;
    clearTimeout(this.hitStopTimer);
    this.hitStopTimer = null;
    if (!this.destroyed) this.ticker.start();
  }

  /** Write the composed transform: damped state + punch zoom + shake offset,
   *  pivoted about the felt center (pivot is position-compensated so the
   *  identity framing renders exactly as an untransformed world). */
  private apply(extraZoom: number, sx: number, sy: number, rot: number): void {
    this.world.scale.set(this.state.zoom + extraZoom);
    this.world.position.set(
      this.L.felt.cx + this.state.x + sx,
      this.L.felt.cy + this.state.y + sy,
    );
    this.world.rotation = rot;
  }

  private onTick = (ticker: Ticker): void => {
    this.tick(ticker.deltaMS);
  };
}
