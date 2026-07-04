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

  private onTick = (ticker: Ticker): void => {
    if (!this.lamp) return;
    const reduced = this.motion.reducedMotion();
    if (reduced) {
      this.lamp.alpha = LAMP_ALPHA_MIN;
      return; // motes + breathe frozen
    }
    this.breatheMs += ticker.deltaMS;
    this.lamp.alpha = breatheAlpha(this.breatheMs);
    if (this.moteGeom) {
      const dt = ticker.deltaMS / 1000;
      for (const m of this.motes) {
        m.y -= m.speed * dt;
        if (m.y < this.moteGeom.top) m.y = this.moteGeom.bottom;
        m.g.position.y = m.y;
      }
    }
  };

  destroy(): void {
    this.ticker.remove(this.onTick);
  }
}
