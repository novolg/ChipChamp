import {
  Application,
  Assets,
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TilingSprite,
  type Texture,
} from 'pixi.js';
import { tableLayout, type LayoutMode, type TableLayout } from './layout';
import type { QualityTier } from './quality';
import type { GameState } from '../engine/types';

/** Textures the scene depends on; loaded once in `create`, reused across rebuilds. */
interface SceneTextures {
  noise: Texture | null;
  cardBack: Texture | null;
}

/** Rail-ring / decoration sizing per layout mode (mirrors table.css desktop vs
 *  the ≤760px portrait block, where the rail is thinner and the deck/watermark
 *  are hidden). */
interface FeltStyle {
  railW: number;
  showDeck: boolean;
  showWatermark: boolean;
  deckW: number;
  watermarkSize: number;
}

function feltStyle(mode: LayoutMode): FeltStyle {
  return mode === 'portrait'
    ? { railW: 9, showDeck: false, showWatermark: false, deckW: 34, watermarkSize: 30 }
    : { railW: 12, showDeck: true, showWatermark: true, deckW: 46, watermarkSize: 46 };
}

/**
 * FeltActor — draws today's felt look purely from `layout.ts` geometry:
 * navy radial felt ellipse, rail ring, racetrack line, vignette, tiled noise
 * overlay and a faint brand watermark. Rebuilt wholesale on a layout change
 * (cheap; static geometry). Board/pot/chips are NOT drawn here — they live in
 * the DOM overlay until Tasks 10/11 move them into the scene.
 */
class FeltActor {
  readonly view = new Container();
  private readonly textures: SceneTextures;

  constructor(textures: SceneTextures) {
    this.textures = textures;
  }

  layout(L: TableLayout, mode: LayoutMode): void {
    // Wholesale rebuild: destroy prior children so a mode swap can't leak nodes.
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { cx, cy, rx, ry } = L.felt;
    const style = feltStyle(mode);

    // Rail ring: a slightly larger ellipse behind the felt (the felt sits on it).
    this.view.addChild(
      new Graphics().ellipse(cx, cy, rx + style.railW, ry + style.railW).fill({ color: 0x18233e }),
    );

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

    // Tiled noise, clipped to the felt ellipse (alpha mirrors .table-felt-noise 0.6).
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
    if (style.showDeck && this.textures.cardBack) {
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
    }
  }
}

/**
 * The PixiJS scene shell. Owns the Application, the four ordered layers
 * (env / table / play / fx) and the FeltActor. This task renders felt + deck
 * only; seats, cards, chips and fx cues arrive in Tasks 9–11 — until then the
 * DOM overlay in TableScene renders everything else.
 */
export class PokerScene {
  private readonly app: Application;
  private mode: LayoutMode;
  private readonly felt: FeltActor;
  private readonly layers: { env: Container; table: Container; play: Container; fx: Container };

  private constructor(app: Application, mode: LayoutMode, felt: FeltActor) {
    this.app = app;
    this.mode = mode;
    this.felt = felt;
    this.layers = {
      env: new Container({ label: 'env' }),
      table: new Container({ label: 'table' }),
      play: new Container({ label: 'play' }),
      fx: new Container({ label: 'fx' }),
    };
    this.app.stage.addChild(this.layers.env, this.layers.table, this.layers.play, this.layers.fx);
    this.layers.table.addChild(this.felt.view);
  }

  /** The Pixi canvas element (append this into the host / read for context-loss). */
  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  static async create(
    host: HTMLElement,
    mode: LayoutMode,
    tier: Exclude<QualityTier, 'dom'>,
  ): Promise<PokerScene> {
    const size = tableLayout(mode).size;
    const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1;

    const app = new Application();
    await app.init({
      width: size.w,
      height: size.h,
      background: 'transparent',
      backgroundAlpha: 0,
      // 'reduced' tier drops antialiasing — the cheaper path per the recipe gate.
      antialias: tier === 'full',
      resolution: Math.min(3, dpr),
      autoDensity: true,
      // Force WebGL: the tier decision is a WebGL capability probe, and WebGPU
      // init is comparatively flaky (esp. headless). Keeps paths predictable.
      preference: 'webgl',
    });

    // Load the two shared textures up front; a missing asset degrades gracefully
    // (that layer is simply skipped) rather than failing the whole scene.
    const [noise, cardBack] = await Promise.all([
      Assets.load<Texture>('/assets/noise.png').catch(() => null),
      Assets.load<Texture>('/assets/card-back.png').catch(() => null),
    ]);

    host.appendChild(app.canvas);
    const scene = new PokerScene(app, mode, new FeltActor({ noise, cardBack }));
    scene.felt.layout(tableLayout(mode), mode);
    app.render();
    return scene;
  }

  /** Settle-to-truth snapshot. Felt/deck are game-independent, so the shell has
   *  nothing to settle; the seat/pot/chip actors that consume `game` land in
   *  Tasks 9–11. */
  sync(_game: GameState): void {
    // intentionally empty (shell: no game-derived scene content yet)
  }

  /** Director scene-channel cue. No scene cues are implemented in the shell;
   *  the SCENE_FX switch lands in Task 9+. */
  fx(_cue: string, _params: Record<string, unknown>, _intensity: number): void {
    // intentionally empty (shell)
  }

  /** Rebuild positions for a new layout mode (no cross-animation — hard swap). */
  setMode(mode: LayoutMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const L = tableLayout(mode);
    const res = this.app.renderer.resolution;
    this.app.renderer.resize(L.size.w, L.size.h, res);
    this.felt.layout(L, mode);
    this.app.render();
  }

  /** Track the frame's CSS fit-scale so the canvas bitmap stays crisp when the
   *  1240×880 `.frame` is transform-scaled by `--fit-scale`.
   *
   *  Deviation from the plan's literal `dpr * fitScale`: below 760px the frame
   *  is fluid (`.frame { transform: none }` in screens.css) so `--fit-scale` is
   *  NOT applied there, yet useFitScale still reports a small value (~0.3 at
   *  390px). Multiplying resolution by it would render a tiny, blurry bitmap on
   *  mobile. Portrait mode ⇔ mobile ⇔ unscaled frame, so we use a frame scale of
   *  1 there — honoring the plan's intent (a crisp canvas) over its formula. */
  resize(fitScale: number): void {
    const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1;
    const frameScale = this.mode === 'portrait' ? 1 : fitScale;
    const resolution = Math.min(3, dpr * frameScale);
    const size = tableLayout(this.mode).size;
    this.app.renderer.resize(size.w, size.h, resolution);
    this.app.render();
  }

  /** Full teardown: destroys the renderer, removes the canvas, and recursively
   *  destroys scene children. Shared textures stay in the Assets cache for reuse
   *  (texture: false) so a StrictMode remount doesn't re-download them. */
  destroy(): void {
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
