import { Container, FillGradient, Graphics, type Ticker } from 'pixi.js';
import type { LayoutMode, Pt, TableLayout } from '../layout';
import type { FeltMotion } from './FeltActor';

export const LAMP_RADIUS = 300;
export const LAMP_Y_OFFSET = -60;
export const LAMP_ALPHA_MIN = 0.1;
export const LAMP_ALPHA_MAX = 0.14;
const LAMP_BREATHE_MS = 8000;
const MOTE_COUNT = 20;
const MOTE_ALPHA = 0.18;
const GOLDEN_ANGLE = 2.399963;

export const LAMP_SWAY_AMP = 4;      // px idle swing
const LAMP_SWAY_MS = 6000;           // idle swing period
const LAMP_PULL = 0.4;               // fraction of rest→seat the pool drifts
const LAMP_HALF_LIFE_MS = 220;       // damping half-life for pos + boost
const LAMP_FOCUS_BOOST = 0.06;       // added alpha while focused
const LAMP_PULSE_BOOST = 0.14;       // peak added alpha at intensity 1
const LAMP_PULSE_MS = 240;
const LAMP_ALPHA_CAP = 0.5;
export const LAMP_BLOOM_MS = 700;    // win hold (replaces the retired WIN_CAM_HOLD_MS)

export function damp(current: number, target: number, dt: number, halfLife: number): number {
  const k = 1 - Math.pow(0.5, dt / halfLife);
  return current + (target - current) * k;
}

export function focusTarget(rest: Pt, target: Pt, pull: number): Pt {
  return { x: rest.x + (target.x - rest.x) * pull, y: rest.y + (target.y - rest.y) * pull };
}

export function swayOffset(elapsedMs: number): number {
  return LAMP_SWAY_AMP * Math.sin((elapsedMs / LAMP_SWAY_MS) * Math.PI * 2);
}

interface Mote { g: Graphics; y: number; speed: number; }

/** Rest center of the light pool: centered above the felt center ("from above"). */
export function lampRest(L: TableLayout): Pt {
  return { x: L.felt.cx, y: L.felt.cy + LAMP_Y_OFFSET };
}

/** Analytic breathing alpha (replaces the GSAP yoyo): a sine sweep between
 *  LAMP_ALPHA_MIN and LAMP_ALPHA_MAX over LAMP_BREATHE_MS. Deterministic. */
export function breatheAlpha(elapsedMs: number): number {
  const phase = (elapsedMs % LAMP_BREATHE_MS) / LAMP_BREATHE_MS;
  const s = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0..1, starts at MIN
  return LAMP_ALPHA_MIN + (LAMP_ALPHA_MAX - LAMP_ALPHA_MIN) * s;
}

/**
 * LampActor — the moving "light from above". At this task: a breathing radial
 * cone at rest above the felt + drifting dust motes inside it (full tier only).
 * Task 3 adds focus/pulse/bloom/sway. Reads reduced-motion live through the
 * shared motion object (mirrors FeltActor).
 */
export class LampActor {
  readonly view = new Container();
  /** Moving group: lamp gradient + motes + mote mask, positioned by a delta
   *  from rest (Task 3 moves this; at parity it stays at 0,0). */
  private readonly pool = new Container();
  private lamp: Graphics | null = null;
  private motes: Mote[] = [];
  private moteGeom: { top: number; bottom: number } | null = null;
  private rest: Pt = { x: 0, y: 0 };
  private breatheMs = 0;

  private focusPt: Pt | null = null;         // active focus target, or null=rest
  private posX = 0; private posY = 0;         // current damped pool center
  private focusBoost = 0;                     // damped brightness boost
  private pulseMs = 0; private pulseAmt = 0;  // transient all-in pulse
  private bloomMs = 0;                        // remaining bloom hold
  private swayMs = 0;

  private readonly motion: FeltMotion;
  private readonly ticker: Ticker;
  private readonly fullTier: boolean;

  constructor(motion: FeltMotion, ticker: Ticker, fullTier: boolean) {
    this.motion = motion;
    this.ticker = ticker;
    this.fullTier = fullTier;
    this.view.addChild(this.pool);
    this.ticker.add(this.onTick);
  }

  layout(L: TableLayout, _mode: LayoutMode): void {
    this.pool.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.pool.position.set(0, 0);
    this.lamp = null;
    this.motes = [];
    this.moteGeom = null;
    this.rest = lampRest(L);
    this.posX = this.rest.x;
    this.posY = this.rest.y;
    this.focusPt = null;
    this.focusBoost = 0;
    this.pulseMs = 0; this.pulseAmt = 0; this.bloomMs = 0;
    if (!this.fullTier) return;

    const { x: lampCx, y: lampCy } = this.rest;
    const lampGradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(255, 255, 255, 1)' },
        { offset: 1, color: 'rgba(255, 255, 255, 0)' },
      ],
      textureSpace: 'local',
    });
    const lamp = new Graphics().circle(lampCx, lampCy, LAMP_RADIUS).fill(lampGradient);
    lamp.blendMode = 'add';
    lamp.alpha = breatheAlpha(0);
    this.pool.addChild(lamp);
    this.lamp = lamp;

    const moteContainer = new Container();
    const moteMask = new Graphics().circle(lampCx, lampCy, LAMP_RADIUS).fill({ color: 0xffffff });
    this.pool.addChild(moteContainer, moteMask);
    moteContainer.mask = moteMask;

    const motes: Mote[] = [];
    for (let i = 0; i < MOTE_COUNT; i++) {
      const angle = (i * GOLDEN_ANGLE) % (Math.PI * 2);
      const radiusFrac = ((i * 53) % 100) / 100;
      const r = Math.sqrt(radiusFrac) * LAMP_RADIUS;
      const x = lampCx + r * Math.cos(angle);
      const y = lampCy + (((i * 37) % (LAMP_RADIUS * 2)) - LAMP_RADIUS);
      const mote = new Graphics().circle(0, 0, 1).fill({ color: 0xffffff });
      mote.alpha = MOTE_ALPHA;
      mote.position.set(x, y);
      moteContainer.addChild(mote);
      motes.push({ g: mote, y, speed: 8 + (i % 5) * 3 });
    }
    this.motes = motes;
    this.moteGeom = { top: lampCy - LAMP_RADIUS, bottom: lampCy + LAMP_RADIUS };
  }

  /** Point the light at a seat (drift + brighten), or null to ease to rest. */
  focus(target: Pt | null): void {
    this.focusPt = target;
    if (this.motion.reducedMotion()) this.snap();
  }

  /** All-in punctuation: a quick brightness spike scaled by intensity. */
  pulse(intensity: number): void {
    if (this.motion.reducedMotion() || intensity <= 0) return;
    this.pulseMs = LAMP_PULSE_MS;
    this.pulseAmt = LAMP_PULSE_BOOST * Math.min(1, intensity);
  }

  /** Win beat: focus the winner + hold an elevated boost for `ms`, then release. */
  bloom(target: Pt, ms: number): void {
    this.focusPt = target;
    if (this.motion.reducedMotion()) { this.snap(); return; }
    this.bloomMs = ms;
  }

  /** Jump to the current targets, drop transients (reduced-motion turns on). */
  snap(): void {
    const t = this.focusPt ? focusTarget(this.rest, this.focusPt, LAMP_PULL) : this.rest;
    this.posX = t.x; this.posY = t.y;
    this.focusBoost = this.focusPt ? LAMP_FOCUS_BOOST : 0;
    this.pulseMs = 0; this.pulseAmt = 0; this.bloomMs = 0;
    this.applyPool();
    if (this.lamp) this.lamp.alpha = LAMP_ALPHA_MIN + this.focusBoost;
  }

  /** Position the moving group by its delta from rest. */
  private applyPool(): void {
    this.pool.position.set(this.posX - this.rest.x, this.posY - this.rest.y);
  }

  private onTick = (ticker: Ticker): void => {
    if (!this.lamp) return;
    const dt = ticker.deltaMS;
    if (this.motion.reducedMotion()) {
      // Snap to focus target (no sway/pulse/bloom), static alpha.
      const t = this.focusPt ? focusTarget(this.rest, this.focusPt, LAMP_PULL) : this.rest;
      this.posX = t.x; this.posY = t.y;
      this.applyPool();
      this.lamp.alpha = LAMP_ALPHA_MIN + (this.focusPt ? LAMP_FOCUS_BOOST : 0);
      return;
    }

    // Position: damp toward the focus target (or rest); add idle sway only when unfocused.
    const base = this.focusPt ? focusTarget(this.rest, this.focusPt, LAMP_PULL) : this.rest;
    this.posX = damp(this.posX, base.x, dt, LAMP_HALF_LIFE_MS);
    this.posY = damp(this.posY, base.y, dt, LAMP_HALF_LIFE_MS);
    this.swayMs += dt;
    const swayX = this.focusPt ? 0 : swayOffset(this.swayMs);
    this.pool.position.set(this.posX - this.rest.x + swayX, this.posY - this.rest.y);

    // Alpha: breathe + damped focus boost + transient pulse + bloom hold.
    this.breatheMs += dt;
    const focusing = this.focusPt !== null;
    this.focusBoost = damp(this.focusBoost, focusing ? LAMP_FOCUS_BOOST : 0, dt, LAMP_HALF_LIFE_MS);
    let pulse = 0;
    if (this.pulseMs > 0) {
      this.pulseMs = Math.max(0, this.pulseMs - dt);
      pulse = this.pulseAmt * (this.pulseMs / LAMP_PULSE_MS);
    }
    let bloom = 0;
    if (this.bloomMs > 0) {
      this.bloomMs = Math.max(0, this.bloomMs - dt);
      bloom = LAMP_FOCUS_BOOST; // sustained extra brightness during the hold
      if (this.bloomMs === 0) this.focusPt = null; // release: ease back to rest
    }
    this.lamp.alpha = Math.min(LAMP_ALPHA_CAP, breatheAlpha(this.breatheMs) + this.focusBoost + pulse + bloom);

    // Motes drift.
    if (this.moteGeom) {
      const s = dt / 1000;
      for (const m of this.motes) {
        m.y -= m.speed * s;
        if (m.y < this.moteGeom.top) m.y = this.moteGeom.bottom;
        m.g.position.y = m.y;
      }
    }
  };

  destroy(): void {
    this.ticker.remove(this.onTick);
  }
}
