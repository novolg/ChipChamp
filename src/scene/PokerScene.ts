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
import { tableLayout, BOT_SLOTS, type LayoutMode, type SeatSlot, type TableLayout, type Pt } from './layout';
import type { QualityTier } from './quality';
import type { GameState } from '../engine/types';
import { createAssets, type SceneAssets } from './assets';
import { CardActor, type CardMotion } from './actors/CardActor';
import { ChipStackActor } from './actors/ChipStackActor';
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

/** All four bet-anchor slots (the three bot slots plus hero). */
const ALL_SLOTS: readonly SeatSlot[] = [...BOT_SLOTS, 'hero'];

/** Chip-disc on-table size per layout mode, scaled down for portrait the same
 *  ~0.75x ratio as the card sizes in layout.ts (cardW 46 vs 62). */
function chipDiscSize(mode: LayoutMode): number {
  return mode === 'portrait' ? 15 : 20;
}

/** Brand-palette confetti colors (mirrors ui/components/Confetti.tsx's
 *  COLORS array so the scene's burst reads the same as the DOM fallback). */
const CONFETTI_COLORS = [0xffa502, 0x006efd, 0xff4757, 0x2ed573, 0xffd166];

/** Narrow an `unknown` scene-cue param to a SeatSlot, or null if it isn't
 *  one — a cheap runtime guard at the director→scene channel boundary
 *  (params arrive as `Record<string, unknown>`). */
function seatSlotOf(v: unknown): SeatSlot | null {
  return v === 'left' || v === 'center' || v === 'right' || v === 'hero' ? v : null;
}

/**
 * FeltActor — draws today's felt look purely from `layout.ts` geometry:
 * navy radial felt ellipse, rail ring, racetrack line, vignette, tiled noise
 * overlay and a faint brand watermark. Rebuilt wholesale on a layout change
 * (cheap; static geometry). Cards/chips are NOT drawn here — cards live in
 * the play layer (CardActor) and chip stacks in the fx layer (ChipStackActor).
 * Exposes the drawn deck stack so the deal ritual can riffle it.
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
 * / play / fx), the FeltActor, the card actors (board / hero / bot), and the
 * chip actors (per-slot bet stacks + the pot cluster). `sync` settles cards
 * and chips to the authoritative GameState when idle, and `fx` plays the
 * director's scene cues (deal ritual, board reveals, rim flash, turn
 * spotlight, bet stacks, street sweep, win push, confetti).
 */
export class PokerScene {
  private readonly app: Application;
  private mode: LayoutMode;
  private readonly felt: FeltActor;
  private readonly assets: SceneAssets;
  private readonly layers: { env: Container; table: Container; play: Container; fx: Container };
  private readonly cards: SceneCards;
  /** The bet-stack actor per seat slot, plus the pot cluster. */
  private readonly chips: { bets: Record<SeatSlot, ChipStackActor>; pot: ChipStackActor };
  /** Shared motion getters (also handed to every ChipStackActor, incl. the
   *  transient sweep-ghosts created on demand). */
  private readonly motion: CardMotion;
  /** Chip actors with a currently in-flight grow/sweep/push tween —
   *  persistent bet/pot actors AND transient sweep-ghosts alike — so
   *  `skip()` can fast-forward them. Self-pruning on the next add. */
  private readonly chipFx = new Set<ChipStackActor>();
  /** Transient sweep-ghost actors (own Pixi view, not part of `chips`) that
   *  need their view explicitly destroyed on teardown/mode-swap, not just
   *  their tween killed. */
  private readonly chipGhosts = new Set<ChipStackActor>();

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
    this.motion = motion;
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

    // Chip stacks render above the felt in the fx layer (topmost), alongside
    // the rim flash / spotlight / confetti overlays already there.
    const mkChip = () => new ChipStackActor((d) => this.assets.chip(d), motion);
    this.chips = {
      bets: { left: mkChip(), center: mkChip(), right: mkChip(), hero: mkChip() },
      pot: mkChip(),
    };
    for (const slot of ALL_SLOTS) this.layers.fx.addChild(this.chips.bets[slot].view);
    this.layers.fx.addChild(this.chips.pot.view);

    this.sizeCards(tableLayout(mode));
    this.sizeChips(tableLayout(mode));
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

  /** Settle-to-truth. Captures the snapshot always; only hard-sets cards +
   *  chips when the deal timeline is idle (an active animation is already
   *  driving the cards toward this same truth; chip actors additionally
   *  self-guard via their own in-flight tween, see `settleChips`). */
  sync(game: GameState): void {
    this.game = game;
    if (this.anim && this.anim.isActive()) return;
    this.settle(game);
  }

  private settle(game: GameState): void {
    const L = tableLayout(this.mode);
    settleCards(this.cards, game, this.assets, this.fourColor, L);
    this.settleChips(game);
  }

  /** Settle-to-truth for the bet stacks + pot cluster: stacks match
   *  `committedThisStreet` per seat exactly while betting (empty on any other
   *  phase — handComplete included); the pot cluster mirrors `pots[].amount`
   *  while the hand is live. Each actor's own `place()` no-ops while a
   *  grow/sweep/push tween owns it, so this is safe to call on every sync
   *  regardless of what's mid-flight. */
  private settleChips(game: GameState): void {
    const betting = game.phase === 'betting';
    const hero = game.seats.find((s) => s.isHuman);
    const bots = game.seats.filter((s) => !s.isHuman);
    BOT_SLOTS.forEach((slot, i) => {
      const seat = bots[i];
      this.chips.bets[slot].place(betting && seat ? seat.committedThisStreet : 0);
    });
    this.chips.bets.hero.place(betting && hero ? hero.committedThisStreet : 0);
    // Sanctioned deviation from the brief's "pot cluster present when
    // pots[].amount > 0" (task-11-brief.md `sync` line): the engine keeps
    // pots[] nonzero through `handComplete`, so a settle during the win screen
    // would resurrect the cluster mid-table after winPush already swept it to
    // the winner. Controller resolution: present only while the hand is live
    // (phase !== 'handComplete'). Under reduced motion winPush already snaps
    // the cluster clear, which composes with this rule (place(0) then no-ops).
    const pot =
      game.phase === 'handComplete' ? 0 : game.pots.reduce((sum, p) => sum + p.amount, 0);
    this.chips.pot.place(pot);
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
      case 'betStack':
        this.playBetStack(params.slot);
        break;
      case 'sweep':
        this.playSweep(Array.isArray(params.from) ? params.from : []);
        break;
      case 'winPush':
        this.playWinPush(params.winnerSlot);
        break;
      case 'confetti':
        this.playConfetti(Number(params.count) || 0);
        break;
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

  /** Track a chip actor with a currently in-flight grow/sweep/push tween so
   *  `skip()` can fast-forward it. Self-pruning: entries whose tween has
   *  already completed are dropped on the next call rather than needing an
   *  onComplete hook (which the actors already use internally). */
  private trackChipFx(actor: ChipStackActor): void {
    for (const a of this.chipFx) if (!a.isAnimating()) this.chipFx.delete(a);
    this.chipFx.add(actor);
  }

  /** ACTION (bet/raise/allin): animate the acting seat's stack growing by the
   *  new chips, arcing in from the seat. Reads the REAL committed amount off
   *  `this.game` rather than the cue's `params.amount` — the ACTION recipe's
   *  `amount` is BB-normalized (for audio/intensity), not a chip count (same
   *  reasoning as `playDealBoard` reading card values off `this.game.board`
   *  instead of trusting cue params). */
  private playBetStack(slotVal: unknown): void {
    const slot = seatSlotOf(slotVal);
    const game = this.game;
    if (!slot || !game) return;
    const seat =
      slot === 'hero'
        ? game.seats.find((s) => s.isHuman)
        : game.seats.filter((s) => !s.isHuman)[BOT_SLOTS.indexOf(slot)];
    if (!seat) return;
    const L = tableLayout(this.mode);
    const actor = this.chips.bets[slot];
    actor.grow(seat.committedThisStreet, L.seats[slot]);
    this.trackChipFx(actor);
  }

  /** SWEEP: each swept seat gets a throwaway "ghost" stack (built from the
   *  cue's captured pre-reset `{slot, amount}` — by the time this fires,
   *  `settleChips` has already zeroed the real bet-stack actors for the new
   *  street, mirroring the DOM fallback's own ghost-pill sweep) that slides
   *  into the pot and bounces it on arrival, then self-destructs. */
  private playSweep(from: unknown[]): void {
    const L = tableLayout(this.mode);
    for (const entry of from) {
      const e = entry as { slot?: unknown; amount?: unknown } | null;
      const slot = seatSlotOf(e?.slot);
      const amount = Number(e?.amount) || 0;
      if (!slot || amount <= 0) continue;
      const ghost = new ChipStackActor((d) => this.assets.chip(d), this.motion);
      ghost.resize(chipDiscSize(this.mode));
      ghost.moveHome(L.bets[slot]);
      ghost.place(amount);
      this.layers.fx.addChild(ghost.view);
      this.chipGhosts.add(ghost);
      ghost.sweepTo(L.pot, () => {
        this.chips.pot.bounce();
        this.chipGhosts.delete(ghost);
        this.chipFx.delete(ghost);
        ghost.view.destroy({ children: true });
      });
      this.trackChipFx(ghost);
    }
  }

  /** WIN: the pot cluster glides to the winner's hole-card slot, splashes,
   *  and clears (see ChipStackActor.pushTo). The WIN feel-event fires at the
   *  transition into `handComplete`, and TableScene settles SYNCHRONOUSLY
   *  while cues dispatch async — so by the time this runs, `settleChips` has
   *  already cleared + hidden the cluster (pot treated as 0 on that phase).
   *  Re-place it first from the REAL pot total on `this.game.pots` — the
   *  engine keeps `pots[]` nonzero through `handComplete`, and the recipe's
   *  `amount` is BB-normalized, not a chip count (same reasoning as
   *  `playBetStack`). The grow() rewind pattern, applied to the pot. Reduced
   *  motion composes: re-place, then pushTo's snap path ends cleared. */
  private playWinPush(slotVal: unknown): void {
    const slot = seatSlotOf(slotVal);
    const game = this.game;
    if (!slot || !game) return;
    const L = tableLayout(this.mode);
    const actor = this.chips.pot;
    actor.place(game.pots.reduce((sum, p) => sum + p.amount, 0));
    actor.pushTo(L.seatCards[slot]);
    this.trackChipFx(actor);
  }

  /** WIN: `count` small brand-colored rects tumbling from the felt's top rim
   *  (a plain Container of Graphics, not Pixi's ParticleContainer — v8's
   *  Particle API needs a shared base texture per container and offers no
   *  per-piece rotation-during-fall the way this burst wants; a few dozen
   *  Graphics rects is cheap enough that the pooling ParticleContainer exists
   *  for isn't worth the API friction here). Deterministic per-index jitter,
   *  no RNG — mirrors ui/components/Confetti.tsx. */
  private playConfetti(count: number): void {
    if (count <= 0 || this.reduced) return;
    const L = tableLayout(this.mode);
    const host = new Container();
    this.layers.fx.addChild(host);
    const tl = gsap.timeline({ onComplete: () => host.destroy({ children: true }) });
    for (let i = 0; i < count; i++) {
      const piece = new Graphics()
        .roundRect(-3, -5, 6, 10, 2)
        .fill({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] });
      const startX = L.felt.cx - L.felt.rx + ((i * 37 + 11) % (L.felt.rx * 2));
      piece.position.set(startX, L.felt.cy - L.felt.ry - 10);
      host.addChild(piece);
      const drift = ((i * 29) % 90) - 45;
      const spin = (((i * 47) % 420) * Math.PI) / 180;
      const delay = this.secsScene(((i * 13) % 12) * 50);
      const dur = this.secsScene(1300 + ((i * 7) % 8) * 100);
      tl.to(
        piece,
        { x: startX + drift, y: L.felt.cy + L.felt.ry, rotation: spin, duration: dur, ease: 'power1.in' },
        delay,
      );
      tl.to(piece, { alpha: 0, duration: Math.min(dur * 0.15, this.secsScene(200)) }, delay + dur * 0.85);
    }
    this.trackLoose(tl);
  }

  /** ms→seconds at the current speed (rimFlash/turnSpotlight inline `/this.speed`
   *  directly; confetti's per-piece math reads more clearly through a helper). */
  private secsScene(ms: number): number {
    return ms / this.speed / 1000;
  }

  /** Jump the in-flight deal + any in-flight chip fx to their rest state
   *  (canvas tap) — nothing is left mid-flight after a skip. */
  private skip = (): void => {
    if (this.anim && this.anim.isActive()) this.anim.progress(1);
    for (const a of this.chipFx) if (a.isAnimating()) a.finish();
    this.chipFx.clear();
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

  private sizeChips(L: TableLayout): void {
    const size = chipDiscSize(this.mode);
    for (const slot of ALL_SLOTS) {
      this.chips.bets[slot].resize(size);
      this.chips.bets[slot].moveHome(L.bets[slot]);
    }
    this.chips.pot.resize(size);
    this.chips.pot.moveHome(L.pot);
  }

  /** Kill every chip actor's in-flight tween (grow/sweep/push/bounce) and,
   *  for transient sweep-ghosts, destroy their Pixi view too (they aren't
   *  reachable from the recursive app.destroy the way pooled actors are,
   *  since destroy() below is the only OTHER caller and setMode doesn't tear
   *  down the Application). Shared by setMode (a hard layout swap) and
   *  destroy (full teardown). */
  private killChipFx(): void {
    for (const g of this.chipGhosts) {
      g.killTweens();
      g.view.destroy({ children: true });
    }
    this.chipGhosts.clear();
    for (const a of this.chipFx) a.killTweens();
    this.chipFx.clear();
    for (const slot of ALL_SLOTS) this.chips.bets[slot].killTweens();
    this.chips.pot.killTweens();
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
    this.killChipFx();
    const L = tableLayout(mode);
    this.app.renderer.resize(L.size.w, L.size.h, this.resolutionFor(mode));
    this.felt.layout(L, mode);
    this.sizeCards(L);
    this.sizeChips(L);
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
    this.killChipFx();
    for (const c of this.cards.board) c.killTweens();
    for (const c of this.cards.hero) c.killTweens();
    for (const slot of ['left', 'center', 'right'] as const)
      for (const c of this.cards.bots[slot]) c.killTweens();
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
