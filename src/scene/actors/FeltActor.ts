import {
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TilingSprite,
  type Texture,
  type Ticker,
} from 'pixi.js';
import { gsap } from 'gsap';
import type { LayoutMode, TableLayout } from '../layout';

/** Live motion the actor reads every ambient tick — only the reduced-motion
 *  flag (the felt's breathing/glint/motes don't scale with game speed the way
 *  card/chip tweens do). `CardMotion` (speed+reducedMotion) satisfies this
 *  structurally, so PokerScene hands its one shared motion object straight
 *  through. Read live, not just at creation: a settings toggle can flip
 *  reduced motion mid-session, and the ambient loop must freeze/resume. */
export interface FeltMotion {
  reducedMotion(): boolean;
}

/** Noise felt texture; the card-back comes from SceneAssets (loaded once). */
export interface SceneTextures {
  noise: Texture | null;
  cardBack: Texture;
}

/** Rail-ring / decoration sizing per layout mode (mirrors table.css desktop vs
 *  the ≤760px portrait block, where the deck/watermark are hidden). The
 *  leather rail band itself is a fixed width across both modes (RAIL_W). */
interface FeltStyle {
  showDeck: boolean;
  showWatermark: boolean;
  deckW: number;
  watermarkSize: number;
}

function feltStyle(mode: LayoutMode): FeltStyle {
  return mode === 'portrait'
    ? { showDeck: false, showWatermark: false, deckW: 34, watermarkSize: 30 }
    : { showDeck: true, showWatermark: true, deckW: 46, watermarkSize: 46 };
}

/* ---------------------------------------------------------------------------
 * Leather rail — base / stitch / brass / traveling glint.
 * ------------------------------------------------------------------------- */

const RAIL_W = 14; // band width beyond the felt edge, both layout modes
const RAIL_BASE = 0x241b14; // leather-dark
const RAIL_STITCH = 0x3a2e22;
const RAIL_STITCH_INSET = 4; // stitch ring sits near the felt (inner) edge of the band
const RAIL_BRASS = 0x8a6d3b;
const STITCH_DASH = 4;
const STITCH_GAP = 4;
const GLINT_LEN = 24;
const GLINT_PERIOD_MS = 14_000;

/** Stroke a dashed ellipse: `steps` short subpaths (moveTo+lineTo pairs, one
 *  `stroke()` call) rather than a continuous line — Pixi/Canvas-style path
 *  building has no native dash pattern. Angularly uniform (not true constant
 *  arc-length) — fine for decorative stitching, cheap, drawn once per
 *  layout(). */
function drawDashedEllipse(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  dash: number,
  gap: number,
  stroke: { width: number; color: number },
): void {
  const period = dash + gap;
  const circumference = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2); // quadratic-mean approx
  const steps = Math.max(8, Math.round(circumference / period));
  const dashAngle = ((Math.PI * 2) / steps) * (dash / period);
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = a0 + dashAngle;
    g.moveTo(cx + rx * Math.cos(a0), cy + ry * Math.sin(a0));
    g.lineTo(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
  }
  g.stroke(stroke);
}

/* ---------------------------------------------------------------------------
 * Lamp cone + dust motes — minTier:'full' only.
 * ------------------------------------------------------------------------- */

const LAMP_RADIUS = 300; // 600px diameter
const LAMP_Y_OFFSET = -60; // centered above felt.cy
const LAMP_ALPHA_MIN = 0.1;
const LAMP_ALPHA_MAX = 0.14;
const LAMP_BREATHE_S = 8;
const MOTE_COUNT = 20;
const MOTE_ALPHA = 0.18;
const GOLDEN_ANGLE = 2.399963; // deterministic even-ish spread, no RNG (matches playConfetti's idiom)

interface Mote {
  g: Graphics;
  y: number;
  speed: number; // px/sec, upward
}

/**
 * FeltActor — draws today's felt look purely from `layout.ts` geometry:
 * navy radial felt ellipse, leather rail with stitch + brass trim + a
 * traveling glint, racetrack line, vignette, tiled noise/weave overlay, a
 * faint brand watermark, and (full tier only) a breathing lamp cone with
 * drifting dust motes. Rebuilt wholesale on a layout change (cheap; static
 * geometry) except the rail glint / lamp breathe / motes, which are driven by
 * one ticker callback registered ONCE in the constructor so it survives
 * `layout()` rebuilds without duplicating. Exposes the drawn deck stack so the
 * deal ritual can riffle it.
 */
class FeltActor {
  readonly view = new Container();
  /** The drawn deck stack (landscape only); null in portrait. */
  deckView: Container | null = null;
  private readonly textures: SceneTextures;
  private readonly motion: FeltMotion;
  private readonly ticker: Ticker;
  private readonly fullTier: boolean;

  /** Rail glint: repositioned every tick along the ellipse; the shape itself
   *  is drawn once per layout(). Present on BOTH tiers (part of the rail). */
  private glint: Graphics | null = null;
  private glintGeom: { cx: number; cy: number; rx: number; ry: number } | null = null;
  private glintElapsedMs = 0;

  /** Lamp breathing — a real GSAP yoyo tween (mirrors CardActor's rimPulse
   *  idiom); the ticker only toggles its paused state so a live reduced-motion
   *  flip is picked up on the very next frame instead of needing a fresh
   *  trigger. Full tier only. */
  private lampBreathe: gsap.core.Tween | null = null;

  /** Dust motes drifting inside the lamp cone; advanced by the same ticker.
   *  Full tier only. */
  private motes: Mote[] = [];
  private moteGeom: { top: number; bottom: number } | null = null;

  constructor(textures: SceneTextures, motion: FeltMotion, ticker: Ticker, fullTier: boolean) {
    this.textures = textures;
    this.motion = motion;
    this.ticker = ticker;
    this.fullTier = fullTier;
    this.ticker.add(this.onTick);
  }

  layout(L: TableLayout, mode: LayoutMode): void {
    // Wholesale rebuild: destroy prior children so a mode swap can't leak nodes.
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.deckView = null;
    this.lampBreathe?.kill();
    this.lampBreathe = null;
    this.glint = null;
    this.glintGeom = null;
    this.motes = [];
    this.moteGeom = null;

    const { cx, cy, rx, ry } = L.felt;
    const style = feltStyle(mode);

    // --- Leather rail: base band, dashed stitch, brass trim + traveling glint.
    this.view.addChild(
      new Graphics().ellipse(cx, cy, rx + RAIL_W, ry + RAIL_W).fill({ color: RAIL_BASE }),
    );
    const stitch = new Graphics();
    drawDashedEllipse(
      stitch,
      cx,
      cy,
      rx + RAIL_STITCH_INSET,
      ry + RAIL_STITCH_INSET,
      STITCH_DASH,
      STITCH_GAP,
      { width: 2, color: RAIL_STITCH },
    );
    this.view.addChild(stitch);
    this.view.addChild(
      new Graphics().ellipse(cx, cy, rx + RAIL_W, ry + RAIL_W).stroke({ width: 1, color: RAIL_BRASS }),
    );
    const glint = new Graphics().roundRect(-GLINT_LEN / 2, -1, GLINT_LEN, 2, 1).fill({ color: RAIL_BRASS });
    glint.blendMode = 'add';
    this.view.addChild(glint);
    this.glint = glint;
    this.glintGeom = { cx, cy, rx: rx + RAIL_W, ry: ry + RAIL_W };
    this.applyGlint(); // place at the current phase now — no pop-in at (0,0) for a frame

    // Felt: navy radial (#1a3a78 → #142c5c → #0c1b3a), highlight biased upward to
    // match `radial-gradient(ellipse at 50% 32%, …)` in tokens.css.
    const feltGradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.34 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.72,
      colorStops: [
        { offset: 0, color: 0x1a3a78 },
        { offset: 0.48, color: 0x142c5c },
        { offset: 1, color: 0x0c1b3a },
      ],
      textureSpace: 'local',
    });
    this.view.addChild(new Graphics().ellipse(cx, cy, rx, ry).fill(feltGradient));

    // Top sheen — a soft cool highlight near the felt's upper third.
    const sheen = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.16 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.16 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(140, 190, 255, 0.14)' },
        { offset: 1, color: 'rgba(140, 190, 255, 0)' },
      ],
      textureSpace: 'local',
    });
    this.view.addChild(new Graphics().ellipse(cx, cy, rx, ry).fill(sheen));

    // Tiled noise, clipped to the felt ellipse (alpha mirrors .table-felt-noise 0.6),
    // plus two faint overlay copies at different pattern orientations so the
    // grain reads as a woven cloth weave (zero new art).
    if (this.textures.noise) {
      const noise = new TilingSprite({
        texture: this.textures.noise,
        width: rx * 2,
        height: ry * 2,
        x: cx - rx,
        y: cy - ry,
      });
      noise.alpha = 0.6;
      const noiseMask = new Graphics().ellipse(cx, cy, rx, ry).fill({ color: 0xffffff });
      this.view.addChild(noise, noiseMask);
      noise.mask = noiseMask;

      const weave1 = new TilingSprite({
        texture: this.textures.noise,
        width: rx * 2,
        height: ry * 2,
        x: cx - rx,
        y: cy - ry,
      });
      weave1.alpha = 0.05;
      weave1.blendMode = 'overlay';
      const weaveMask1 = new Graphics().ellipse(cx, cy, rx, ry).fill({ color: 0xffffff });
      this.view.addChild(weave1, weaveMask1);
      weave1.mask = weaveMask1;

      // Second copy: offset 1px, texture pattern rotated 90° (tileRotation —
      // rotating the TilingSprite's own transform would swap its footprint
      // and gap the non-square felt ellipse; tileRotation only reorients the
      // repeating pattern, keeping full ellipse coverage).
      const weave2 = new TilingSprite({
        texture: this.textures.noise,
        width: rx * 2,
        height: ry * 2,
        x: cx - rx + 1,
        y: cy - ry + 1,
      });
      weave2.tileRotation = Math.PI / 2;
      weave2.alpha = 0.03;
      weave2.blendMode = 'overlay';
      const weaveMask2 = new Graphics().ellipse(cx, cy, rx, ry).fill({ color: 0xffffff });
      this.view.addChild(weave2, weaveMask2);
      weave2.mask = weaveMask2;
    }

    // Vignette: transparent centre → dark rim (approximates the inset shadows).
    const vignette = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.72,
      colorStops: [
        { offset: 0, color: 'rgba(6, 12, 26, 0)' },
        { offset: 0.62, color: 'rgba(6, 12, 26, 0)' },
        { offset: 1, color: 'rgba(6, 12, 26, 0.55)' },
      ],
      textureSpace: 'local',
    });
    this.view.addChild(new Graphics().ellipse(cx, cy, rx, ry).fill(vignette));

    // Inner rim highlight + racetrack betting line (the two inset borders).
    this.view.addChild(
      new Graphics()
        .ellipse(cx, cy, rx - 2, ry - 2)
        .stroke({ width: 2, color: 0x6ea0ff, alpha: 0.28 }),
    );
    this.view.addChild(
      new Graphics()
        .ellipse(cx, cy, rx - rx * 0.11, ry - ry * 0.18)
        .stroke({ width: 1.5, color: 0x6ea0ff, alpha: 0.16 }),
    );

    // Faint brand watermark near the felt's lower third.
    if (style.showWatermark) {
      const mark = new Text({
        text: 'CHIPCHAMP',
        style: {
          fontFamily: 'Kanit, system-ui, sans-serif',
          fontSize: style.watermarkSize,
          fontWeight: '900',
          fontStyle: 'italic',
          letterSpacing: 4,
          fill: 0xbcd2ff,
        },
      });
      mark.anchor.set(0.5);
      mark.position.set(cx, cy + ry * 0.6);
      mark.alpha = 0.06;
      this.view.addChild(mark);
    }

    // Deck stack: a rotated card-back at layout.deck, with a couple of offset
    // navy plates behind it to read as a physical stack.
    if (style.showDeck) {
      const deck = new Container();
      const w = style.deckW;
      const h = w * (L.cardH / L.cardW);
      for (const [dx, dy, alpha] of [
        [-6, 9, 0.9],
        [-3, 5, 0.95],
      ] as const) {
        deck.addChild(
          new Graphics()
            .roundRect(-w / 2 + dx, -h / 2 + dy, w, h, 5)
            .fill({ color: 0x13234c, alpha }),
        );
      }
      const back = new Sprite(this.textures.cardBack);
      back.anchor.set(0.5);
      back.width = w;
      back.height = h;
      deck.addChild(back);
      deck.position.set(L.deck.x, L.deck.y);
      deck.rotation = 0.105; // ~6deg, matches .felt-deck
      this.view.addChild(deck);
      this.deckView = deck;
    }

    // --- Lamp cone + dust motes (full tier only).
    if (this.fullTier) {
      const lampCx = cx;
      const lampCy = cy + LAMP_Y_OFFSET;

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
      this.view.addChild(lamp);
      // fromTo's immediateRender applies the LAMP_ALPHA_MIN "from" state right
      // away (even while paused: true below), so a reduced-motion session
      // starts at a sane static alpha instead of popping in at 0.
      this.lampBreathe = gsap.fromTo(
        lamp,
        { alpha: LAMP_ALPHA_MIN },
        {
          alpha: LAMP_ALPHA_MAX,
          duration: LAMP_BREATHE_S,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          paused: true, // the ticker (onTick) owns play/pause every frame — see below
        },
      );

      const moteContainer = new Container();
      const moteMask = new Graphics().circle(lampCx, lampCy, LAMP_RADIUS).fill({ color: 0xffffff });
      this.view.addChild(moteContainer, moteMask);
      moteContainer.mask = moteMask;

      const motes: Mote[] = [];
      for (let i = 0; i < MOTE_COUNT; i++) {
        // Deterministic pseudo-random placement (index-derived, no RNG) —
        // mirrors playConfetti's per-index jitter idiom in PokerScene.
        const angle = (i * GOLDEN_ANGLE) % (Math.PI * 2);
        const radiusFrac = ((i * 53) % 100) / 100;
        const r = Math.sqrt(radiusFrac) * LAMP_RADIUS; // sqrt: uniform area distribution
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
  }

  /** Place the glint segment at its current phase, tangent-rotated to the
   *  ellipse. Called every tick and once at the end of layout() so a fresh
   *  rebuild doesn't pop in at (0,0) for a frame. */
  private applyGlint(): void {
    if (!this.glint || !this.glintGeom) return;
    const { cx, cy, rx, ry } = this.glintGeom;
    const angle = (this.glintElapsedMs / GLINT_PERIOD_MS) * Math.PI * 2;
    this.glint.position.set(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
    // Tangent direction of the parametric ellipse at `angle` — reads as the
    // segment riding the rail rather than sliding sideways across it.
    this.glint.rotation = Math.atan2(ry * Math.cos(angle), -rx * Math.sin(angle));
  }

  /** The one ambient driver for everything this actor animates continuously
   *  (rail glint travel, lamp breathe play/pause, mote drift). Registered
   *  ONCE in the constructor — layout() only replaces the geometry/state
   *  fields it reads, so it never double-registers across a mode swap.
   *  Reduced motion is checked live, every frame: DYNAMIC per the plan (a
   *  settings toggle mid-session must freeze/resume these, not just gate
   *  their creation). */
  private onTick = (ticker: Ticker): void => {
    const reduced = this.motion.reducedMotion();

    // Rail glint: present on both tiers. Advance phase only while motion is
    // not reduced; freezing the accumulator (not just skipping the redraw)
    // means it resumes from the same spot rather than jumping.
    if (this.glint) {
      if (!reduced) this.glintElapsedMs = (this.glintElapsedMs + ticker.deltaMS) % GLINT_PERIOD_MS;
      this.applyGlint();
    }

    // Lamp breathe: idempotent play-state sync each frame (full tier only —
    // null when the actor was built at the reduced tier).
    this.lampBreathe?.paused(reduced);

    // Motes: advance drift only while not reduced; frozen in place otherwise.
    if (!reduced && this.moteGeom) {
      const dt = ticker.deltaMS / 1000;
      for (const m of this.motes) {
        m.y -= m.speed * dt;
        if (m.y < this.moteGeom.top) m.y = this.moteGeom.bottom;
        m.g.position.y = m.y;
      }
    }
  };

  /** Detach from the ticker and kill the breathe tween — called once by
   *  PokerScene.destroy(). (A `setMode` rebuild does NOT call this: the
   *  ticker callback is registered once in the constructor and reads the
   *  fields `layout()` replaces, so it never needs re-registering.) */
  destroy(): void {
    this.ticker.remove(this.onTick);
    this.lampBreathe?.kill();
    this.lampBreathe = null;
  }
}

export { FeltActor };
