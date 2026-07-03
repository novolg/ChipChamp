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
import { gsap } from 'gsap';
import { tableLayout, type LayoutMode, type SeatSlot, type TableLayout, type Pt } from './layout';
import type { QualityTier } from './quality';
import type { GameState } from '../engine/types';
import { createAssets, type SceneAssets } from './assets';
import { CardActor, type CardMotion } from './actors/CardActor';
import {
  settleCards,
  boardSlotPositions,
  boardCardSize,
  heroCardSize,
  botCardSize,
  heroCardPositions,
  botCardPositions,
  type SceneCards,
} from './sync';

/** Noise felt texture; the card-back comes from SceneAssets (loaded once). */
interface SceneTextures {
  noise: Texture | null;
  cardBack: Texture;
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
 * (cheap; static geometry). Cards/pot/chips are NOT drawn here — the cards
 * live in the play layer (CardActor); pot/chips stay in the DOM overlay until
 * Task 11. Exposes the drawn deck stack so the deal ritual can riffle it.
 */
class FeltActor {
  readonly view = new Container();
  /** The drawn deck stack (landscape only); null in portrait. */
  deckView: Container | null = null;
  private readonly textures: SceneTextures;

  constructor(textures: SceneTextures) {
    this.textures = textures;
  }

  layout(L: TableLayout, mode: LayoutMode): void {
    // Wholesale rebuild: destroy prior children so a mode swap can't leak nodes.
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.deckView = null;
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
  }
}

/**
 * The PixiJS scene. Owns the Application, the four ordered layers (env / table
 * / play / fx), the FeltActor and the card actors (board / hero / bot). Task 10
 * moves all cards into the scene: `sync` settles them to the authoritative
 * GameState when idle, and `fx` plays the director's scene cues (deal ritual,
 * board reveals, rim flash, turn spotlight). Pot/chips stay in the DOM overlay
 * until Task 11.
 */
export class PokerScene {
  private readonly app: Application;
  private mode: LayoutMode;
  private readonly felt: FeltActor;
  private readonly assets: SceneAssets;
  private readonly layers: { env: Container; table: Container; play: Container; fx: Container };
  private readonly cards: SceneCards;

  /** Current motion settings (pushed from TableScene); read by CardActor. */
  private speed = 1;
  private reduced = false;
  private fourColor = false;

  /** Latest game snapshot (captured every sync, even while animating) so the
   *  deal cues know which seats/cards to animate. */
  private game: GameState | null = null;

  /** The in-flight card-deal timeline; settle-to-truth waits for it to idle and
   *  a canvas pointerdown skips it to the end. */
  private anim: gsap.core.Timeline | null = null;
  /** Loose overlay timelines (rim flash / spotlight) — killed on destroy. */
  private readonly loose = new Set<gsap.core.Timeline>();
  /** Unknown scene cues already warned about (warn once per name). */
  private readonly warned = new Set<string>();

  /** Last fit-scale seen by resize(); setMode reuses it to recompute resolution. */
  private lastFitScale = 1;

  private constructor(app: Application, mode: LayoutMode, felt: FeltActor, assets: SceneAssets) {
    this.app = app;
    this.mode = mode;
    this.felt = felt;
    this.assets = assets;
    this.layers = {
      env: new Container({ label: 'env' }),
      table: new Container({ label: 'table' }),
      play: new Container({ label: 'play' }),
      fx: new Container({ label: 'fx' }),
    };
    this.app.stage.addChild(this.layers.env, this.layers.table, this.layers.play, this.layers.fx);
    this.layers.table.addChild(this.felt.view);

    const motion: CardMotion = { speed: () => this.speed, reducedMotion: () => this.reduced };
    const back = assets.cardBack();
    const mk = () => new CardActor(back, motion);
    this.cards = {
      board: Array.from({ length: 5 }, mk),
      hero: Array.from({ length: 2 }, mk),
      bots: {
        left: Array.from({ length: 2 }, mk),
        center: Array.from({ length: 2 }, mk),
        right: Array.from({ length: 2 }, mk),
      },
    };
    // z-order: board under bot backs under hero cards.
    for (const c of this.cards.board) this.layers.play.addChild(c.view);
    for (const slot of ['left', 'center', 'right'] as const)
      for (const c of this.cards.bots[slot]) this.layers.play.addChild(c.view);
    for (const c of this.cards.hero) this.layers.play.addChild(c.view);

    this.sizeCards(tableLayout(mode));
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

    // SceneAssets loads the card-back + chip PNGs (card-back once — the felt deck
    // and every CardActor share it); noise is felt-only, loaded alongside. A
    // missing asset degrades gracefully (that layer/texture is skipped).
    const [assets, noise] = await Promise.all([
      createAssets(app.renderer),
      Assets.load<Texture>('/assets/noise.png').catch(() => null),
    ]);

    host.appendChild(app.canvas);
    const scene = new PokerScene(
      app,
      mode,
      new FeltActor({ noise, cardBack: assets.cardBack() }),
      assets,
    );
    scene.felt.layout(tableLayout(mode), mode);
    // A canvas tap skips the current deal to its rest state.
    app.canvas.addEventListener('pointerdown', scene.skip);
    app.render();
    return scene;
  }

  /** Push motion settings from the UI (speed divides tween durations;
   *  reducedMotion snaps). */
  setMotion(speed: number, reducedMotion: boolean): void {
    this.speed = speed;
    this.reduced = reducedMotion;
  }

  /** Switch the card-face color scheme; re-bakes faces and resettles. */
  setFourColor(fourColor: boolean): void {
    if (fourColor === this.fourColor) return;
    this.fourColor = fourColor;
    this.assets.clearCardCache();
    if (this.game) this.settle(this.game);
    this.app.render();
  }

  /** Settle-to-truth. Captures the snapshot always; only hard-sets the cards
   *  when the deal timeline is idle (an active animation is already driving them
   *  toward this same truth). */
  sync(game: GameState): void {
    this.game = game;
    if (this.anim && this.anim.isActive()) return;
    this.settle(game);
  }

  private settle(game: GameState): void {
    settleCards(this.cards, game, this.assets, this.fourColor, tableLayout(this.mode));
  }

  /** Director scene-channel cue. Never throws on a recipe: known-but-unhandled
   *  cues are explicit no-ops; genuinely unknown names warn once. */
  fx(cue: string, params: Record<string, unknown>, _intensity: number): void {
    switch (cue) {
      case 'dealRitual':
        this.playRitual();
        break;
      case 'dealHole':
        this.startAnim((tl) => this.addHoleDeal(tl, tableLayout(this.mode), 0));
        break;
      case 'dealBoard':
        this.playDealBoard(Number(params.count) || 0);
        break;
      case 'rimFlash':
        this.playRimFlash();
        break;
      case 'turnSpotlight':
        this.playTurnSpotlight();
        break;
      // DOM overlay owns confetti in Phase 1 (FreePlayScreen win-overlay).
      case 'confetti':
      // Chip/pot motion arrives with the chip actors in Task 11.
      case 'betStack':
      case 'sweep':
      case 'winPush':
      // Camera moves are a later phase.
      case 'camPunch':
      case 'camZoomSeat':
      case 'camReset':
        break;
      default:
        if (!this.warned.has(cue)) {
          this.warned.add(cue);
          console.warn(`[PokerScene] unknown scene fx cue "${cue}" — ignoring.`);
        }
    }
  }

  // --- deal animations -------------------------------------------------------

  /** Replace the in-flight deal timeline with a freshly built one (auto-plays). */
  private startAnim(build: (tl: gsap.core.Timeline) => void): void {
    this.anim?.kill();
    const tl = gsap.timeline();
    build(tl);
    this.anim = tl;
  }

  private hideAllCards(): void {
    for (const c of this.cards.board) c.hide();
    for (const c of this.cards.hero) c.hide();
    for (const slot of ['left', 'center', 'right'] as const)
      for (const c of this.cards.bots[slot]) c.hide();
  }

  /** HAND_START: a quick deck riffle, then the hole cards dealt clockwise. */
  private playRitual(): void {
    const L = tableLayout(this.mode);
    this.hideAllCards();
    this.startAnim((tl) => {
      const riffleEnd = this.addRiffle(tl);
      this.addHoleDeal(tl, L, riffleEnd);
    });
  }

  /** Append a 3-beat wiggle of the drawn deck; returns its end time (seconds).
   *  No-op (returns 0) when the deck isn't drawn (portrait) or under reduced
   *  motion. */
  private addRiffle(tl: gsap.core.Timeline): number {
    const deck = this.felt.deckView;
    if (!deck || this.reduced) return 0;
    const r = deck.rotation;
    const d = 0.05 / this.speed;
    tl.to(deck, { rotation: r + 0.06, duration: d, ease: 'sine.inOut' }, 0)
      .to(deck, { rotation: r - 0.04, duration: d, ease: 'sine.inOut' })
      .to(deck, { rotation: r, duration: d, ease: 'sine.inOut' });
    return d * 3;
  }

  /** Deal two cards to each in-hand seat, clockwise from the deck, starting at
   *  `baseSec` in the parent timeline. Bot cards land face-down; hero cards flip
   *  face-up after landing. */
  private addHoleDeal(tl: gsap.core.Timeline, L: TableLayout, baseSec: number): void {
    const game = this.game;
    if (!game) return;
    const heroSeat = game.seats.find((s) => s.isHuman);
    const botSeats = game.seats.filter((s) => !s.isHuman);
    const order: { slot: SeatSlot; seat: typeof heroSeat }[] = [
      { slot: 'hero', seat: heroSeat },
      { slot: 'left', seat: botSeats[0] },
      { slot: 'center', seat: botSeats[1] },
      { slot: 'right', seat: botSeats[2] },
    ];
    const heroPos = heroCardPositions(L);
    let n = 0;
    for (let round = 0; round < 2; round++) {
      for (const { slot, seat } of order) {
        if (!seat || seat.status === 'out' || seat.holeCards.length !== 2) continue;
        const faceUp = slot === 'hero';
        const card = faceUp ? this.cards.hero[round] : this.cards.bots[slot][round];
        const to: Pt = faceUp ? heroPos[round] : botCardPositions(L, slot)[round].pt;
        if (faceUp) card.setFace(this.assets.cardFace(seat.holeCards[round], this.fourColor));
        tl.add(card.deal(L.deck, to, faceUp, n * 60), baseSec);
        n++;
      }
    }
  }

  /** STREET_REVEAL: deal the last `count` board cards deck→slot, staggered,
   *  each flipping face-up on landing. */
  private playDealBoard(count: number): void {
    const game = this.game;
    if (!game || count <= 0) return;
    const L = tableLayout(this.mode);
    const total = game.board.length;
    const positions = boardSlotPositions(L, total);
    const start = Math.max(0, total - count);
    this.startAnim((tl) => {
      for (let i = start; i < total; i++) {
        const card = this.cards.board[i];
        card.setFace(this.assets.cardFace(game.board[i], this.fourColor));
        tl.add(card.deal(L.deck, positions[i], true, (i - start) * 120), 0);
      }
    });
  }

  private trackLoose(tl: gsap.core.Timeline): void {
    this.loose.add(tl);
    tl.eventCallback('onComplete', () => this.loose.delete(tl));
  }

  /** A bright additive pulse around the felt rim (all-in punctuation). */
  private playRimFlash(): void {
    if (this.reduced) return;
    const { cx, cy, rx, ry } = tableLayout(this.mode).felt;
    const g = new Graphics().ellipse(cx, cy, rx, ry).stroke({ width: 6, color: 0xffffff, alpha: 1 });
    g.alpha = 0;
    g.blendMode = 'add';
    this.layers.fx.addChild(g);
    const tl = gsap
      .timeline({ onComplete: () => g.destroy() })
      .to(g, { alpha: 0.55, duration: 0.08 / this.speed, ease: 'power1.out' })
      .to(g, { alpha: 0, duration: 0.34 / this.speed, ease: 'power2.out' });
    this.trackLoose(tl);
  }

  /** A soft additive glow at the hero seat when the player's turn begins. */
  private playTurnSpotlight(): void {
    if (this.reduced) return;
    const p = tableLayout(this.mode).seats.hero;
    const g = new Graphics().circle(p.x, p.y, 120).fill({ color: 0x8cbeff, alpha: 1 });
    g.alpha = 0;
    g.blendMode = 'add';
    this.layers.fx.addChild(g);
    const tl = gsap
      .timeline({ onComplete: () => g.destroy() })
      .to(g, { alpha: 0.18, duration: 0.15 / this.speed, ease: 'power1.out' })
      .to(g, { alpha: 0, duration: 0.5 / this.speed, ease: 'power2.out' });
    this.trackLoose(tl);
  }

  /** Jump the in-flight deal to its rest state (canvas tap). */
  private skip = (): void => {
    if (this.anim && this.anim.isActive()) this.anim.progress(1);
  };

  // --- sizing / layout -------------------------------------------------------

  private sizeCards(L: TableLayout): void {
    const b = boardCardSize(L);
    for (const c of this.cards.board) c.resize(b.w, b.h);
    const h = heroCardSize(L);
    for (const c of this.cards.hero) c.resize(h.w, h.h);
    const bs = botCardSize(L);
    for (const slot of ['left', 'center', 'right'] as const)
      for (const c of this.cards.bots[slot]) c.resize(bs.w, bs.h);
  }

  /** Renderer resolution for a mode, from the last known fit-scale.
   *
   *  Deviation from the plan's literal `dpr * fitScale`: below 760px the frame
   *  is fluid (`.frame { transform: none }` in screens.css) so `--fit-scale` is
   *  NOT applied there, yet useFitScale still reports a small value (~0.3 at
   *  390px). Multiplying resolution by it would render a tiny, blurry bitmap on
   *  mobile. Portrait mode ⇔ mobile ⇔ unscaled frame, so we use a frame scale of
   *  1 there — honoring the plan's intent (a crisp canvas) over its formula. */
  private resolutionFor(mode: LayoutMode): number {
    const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1;
    const frameScale = mode === 'portrait' ? 1 : this.lastFitScale;
    return Math.min(3, dpr * frameScale);
  }

  /** Rebuild positions for a new layout mode (no cross-animation — hard swap).
   *  Any in-flight deal is dropped (its coordinates are now stale) and the cards
   *  are resettled at the new mode. */
  setMode(mode: LayoutMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.anim?.kill();
    this.anim = null;
    const L = tableLayout(mode);
    this.app.renderer.resize(L.size.w, L.size.h, this.resolutionFor(mode));
    this.felt.layout(L, mode);
    this.sizeCards(L);
    if (this.game) this.settle(this.game);
    this.app.render();
  }

  /** Track the frame's CSS fit-scale so the canvas bitmap stays crisp when the
   *  1240×880 `.frame` is transform-scaled by `--fit-scale`. */
  resize(fitScale: number): void {
    this.lastFitScale = fitScale;
    const size = tableLayout(this.mode).size;
    this.app.renderer.resize(size.w, size.h, this.resolutionFor(this.mode));
    this.app.render();
  }

  /** Full teardown: kills every tween (so nothing ticks a destroyed node),
   *  destroys the renderer, removes the canvas, and recursively destroys scene
   *  children. Shared textures stay in the Assets cache for reuse (texture:
   *  false) so a StrictMode remount doesn't re-download them. */
  destroy(): void {
    this.app.canvas.removeEventListener('pointerdown', this.skip);
    this.anim?.kill();
    this.anim = null;
    for (const tl of this.loose) tl.kill();
    this.loose.clear();
    for (const c of this.cards.board) c.killTweens();
    for (const c of this.cards.hero) c.killTweens();
    for (const slot of ['left', 'center', 'right'] as const)
      for (const c of this.cards.bots[slot]) c.killTweens();
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
