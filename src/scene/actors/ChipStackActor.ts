import { Container, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { Pt } from '../layout';
import { chipBreakdown, type ChipDenom } from '../assets';
import type { CardMotion } from './CardActor';

const MAX_COLS = 3;
const ROW_RISE = 3; // px per disc, stacking upward (echoes the felt-deck's offset-plate trick)
const COL_GAP_RATIO = 0.72; // column spacing as a fraction of disc size

const GROW_MS = 200;
const GROW_STAGGER_MS = 40;
const SWEEP_MS = 420;
const PUSH_MS = 500;
const SPLASH_MS = 420;
const PUSH_FADE_MS = 220;
const BOUNCE_MS = 260;
const SPLASH_COUNT = 8;
const SPLASH_DENOMS: readonly ChipDenom[] = [100, 25, 10, 5, 1];

/**
 * Bucket a chip amount's greedy denomination breakdown (`assets.chipBreakdown`)
 * into at most `maxCols` physical stack columns, bottom-to-top per column.
 * Denomination groups beyond `maxCols - 1` collapse into the last column
 * (e.g. a 5-group breakdown → col0: the 100s, col1: the 25s, col2: 10s+5s+1s
 * stacked together) so a stack never grows wider than the brief's "≤3
 * columns" regardless of how fragmented the breakdown is. Pure.
 */
export function chipColumns(amount: number, maxCols: number = MAX_COLS): ChipDenom[][] {
  const cols: ChipDenom[][] = [];
  chipBreakdown(amount).forEach((group, i) => {
    const col = Math.min(i, maxCols - 1);
    const target = (cols[col] ??= []);
    for (let n = 0; n < group.count; n++) target.push(group.denom);
  });
  return cols;
}

export interface ChipColumnAdd {
  col: number;
  row: number;
  denom: ChipDenom;
}

/**
 * The discs present in `next` beyond the common bottom-up prefix already in
 * `prev`, per column — exactly the new chips a re-bet should animate in, per
 * the brief ("Re-bet replaces amount: diff columns, only new discs animate").
 * Pure.
 */
export function chipColumnDiff(prev: ChipDenom[][], next: ChipDenom[][]): ChipColumnAdd[] {
  const added: ChipColumnAdd[] = [];
  next.forEach((nextCol, col) => {
    const prevCol = prev[col] ?? [];
    let row = 0;
    while (row < nextCol.length && prevCol[row] === nextCol[row]) row++;
    for (; row < nextCol.length; row++) added.push({ col, row, denom: nextCol[row] });
  });
  return added;
}

/**
 * A positioned stack of chip-disc sprites at one world anchor (a bet slot or
 * the pot). Composition is `chipColumns(amount)`; behaviors: `place` (instant
 * settle-to-truth), `grow` (animated re-bet, arcing only the new discs in
 * from the seat), `sweepTo` (street-end slide into the pot), `pushTo` (win
 * push + splash), `bounce` (a sweep landing on the pot). Durations divide by
 * `motion.speed()`; `motion.reducedMotion()` snaps every behavior to its end
 * state — mirrors CardActor's idiom, including the single owned-tween field
 * killed before every reassignment (the muckTl/rimPulse pattern).
 */
export class ChipStackActor {
  readonly view = new Container();

  private home: Pt = { x: 0, y: 0 };
  private discSize = 20;
  private amount = 0;
  /** The amount the last completed `grow`/`place` fully caught up to — the
   *  diff base for the NEXT `grow`, tracked separately from `amount` because
   *  `place` (settle-to-truth, called synchronously from `PokerScene.sync`)
   *  can race ahead of the async `betStack` fx cue for the SAME bet (the
   *  director schedules cues a frame later than the synchronous sync call);
   *  `grow` rewinds to `animatedTo`'s composition before animating so that
   *  race can't erase the pre-bet picture it needs to diff against. */
  private animatedTo = 0;
  private columns: ChipDenom[][] = [];
  private sprites: Sprite[][] = [];
  /** Transient splash-only sprites (winPush), cleared alongside the main
   *  composition — never part of `columns`/`sprites` bookkeeping. */
  private extra: Sprite[] = [];
  /** The single owned tween/timeline for whichever behavior is in flight
   *  (grow / sweepTo / pushTo — mutually exclusive per actor). */
  private tl: gsap.core.Timeline | null = null;
  private bounceTl: gsap.core.Timeline | null = null;

  constructor(
    private readonly chipTex: (denom: ChipDenom) => Texture,
    private readonly motion: CardMotion,
  ) {
    this.view.visible = false;
  }

  private secs(ms: number): number {
    return ms / this.motion.speed() / 1000;
  }

  /** Whether a grow/sweep/push tween currently owns this actor. */
  isAnimating(): boolean {
    return this.tl != null;
  }

  /** Reposition the stack's rest anchor (a layout mode change). Left alone
   *  while a tween owns the view's position — the caller re-derives a fresh
   *  target from the new layout for any behavior it restarts. */
  moveHome(pt: Pt): void {
    this.home = pt;
    if (!this.tl) this.view.position.set(pt.x, pt.y);
  }

  /** Set the on-table disc size (world px); rescales any existing discs. */
  resize(discSize: number): void {
    this.discSize = discSize;
    for (const col of this.sprites) {
      for (const s of col) {
        s.width = discSize;
        s.height = discSize;
      }
    }
    this.relayout();
  }

  private colGap(): number {
    return this.discSize * COL_GAP_RATIO;
  }

  private discPos(col: number, row: number, colCount: number): Pt {
    const gap = this.colGap();
    const span = (colCount - 1) * gap;
    return { x: -span / 2 + col * gap, y: -row * ROW_RISE };
  }

  private relayout(): void {
    const colCount = this.sprites.length;
    this.sprites.forEach((col, c) =>
      col.forEach((sprite, r) => {
        const p = this.discPos(c, r, colCount);
        sprite.position.set(p.x, p.y);
      }),
    );
  }

  private makeDisc(denom: ChipDenom): Sprite {
    const s = new Sprite(this.chipTex(denom));
    s.anchor.set(0.5);
    s.width = this.discSize;
    s.height = this.discSize;
    return s;
  }

  /** Tear down every disc sprite (composition + any splash leftovers) and
   *  reset to empty/hidden at home. */
  private clear(): void {
    for (const col of this.sprites) for (const s of col) s.destroy();
    for (const s of this.extra) s.destroy();
    this.sprites = [];
    this.extra = [];
    this.columns = [];
    this.view.removeChildren();
    this.view.visible = false;
    this.view.alpha = 1;
    this.view.scale.set(1);
    this.view.position.set(this.home.x, this.home.y);
    this.amount = 0;
    this.animatedTo = 0;
  }

  /** Rebuild from scratch (instant, no tween) to match `cols`. */
  private rebuild(cols: ChipDenom[][]): void {
    for (const col of this.sprites) for (const s of col) s.destroy();
    this.view.removeChildren();
    this.sprites = cols.map((col, c) =>
      col.map((denom, r) => {
        const s = this.makeDisc(denom);
        const p = this.discPos(c, r, cols.length);
        s.position.set(p.x, p.y);
        this.view.addChild(s);
        return s;
      }),
    );
    this.columns = cols;
  }

  /** Settle-to-truth: hard-set to `amount`, no animation. A no-op while a
   *  behavior tween owns this actor (its own completion re-syncs) or when
   *  `amount` already matches the fully-settled truth — idempotent, safe to
   *  call on every sync regardless of what's in flight. */
  place(amount: number): void {
    if (this.tl) return;
    if (amount === this.amount && amount === this.animatedTo) return;
    if (amount <= 0) {
      this.clear();
      return;
    }
    this.rebuild(chipColumns(amount));
    this.view.position.set(this.home.x, this.home.y);
    this.view.scale.set(1);
    this.view.alpha = 1;
    this.view.visible = true;
    this.amount = amount;
    this.animatedTo = amount;
  }

  /** Animated re-bet: diff the last-settled composition against `amount`'s
   *  and arc only the NEW discs in from `from` (the seat), 200ms
   *  `back.out(1.4)`, staggered 40ms. Reduced motion snaps to `place`. */
  grow(amount: number, from: Pt): gsap.core.Timeline {
    this.tl?.kill();
    this.tl = null;
    const tl = gsap.timeline();
    if (this.motion.reducedMotion() || amount <= 0) {
      this.place(amount);
      return tl;
    }

    const prevCols = chipColumns(this.animatedTo);
    const nextCols = chipColumns(amount);
    this.rebuild(prevCols);
    this.view.position.set(this.home.x, this.home.y);
    this.view.scale.set(1);
    this.view.alpha = 1;
    this.view.visible = true;

    const localFrom = { x: from.x - this.home.x, y: from.y - this.home.y };
    const added = chipColumnDiff(prevCols, nextCols);
    added.forEach(({ col, row, denom }, i) => {
      (this.columns[col] ??= [])[row] = denom;
      (this.sprites[col] ??= [])[row] = this.makeDisc(denom);
      const sprite = this.sprites[col][row];
      sprite.position.set(localFrom.x, localFrom.y);
      this.view.addChild(sprite);
      const to = this.discPos(col, row, nextCols.length);
      const at = this.secs(i * GROW_STAGGER_MS);
      tl.to(
        sprite.position,
        { x: to.x, y: to.y, duration: this.secs(GROW_MS), ease: 'back.out(1.4)' },
        at,
      );
    });
    // A denom group crossing into a new column shifts every column's
    // centering span — re-home the untouched (already-settled) discs' x so
    // the whole stack stays centered under its new column count.
    if (nextCols.length !== prevCols.length) {
      this.sprites.forEach((col, c) =>
        col.forEach((sprite, r) => {
          if (added.some((a) => a.col === c && a.row === r)) return;
          sprite.position.x = this.discPos(c, r, nextCols.length).x;
        }),
      );
    }

    this.amount = amount;
    tl.eventCallback('onComplete', () => {
      this.animatedTo = amount;
      if (this.tl === tl) this.tl = null;
    });
    this.tl = tl;
    return tl;
  }

  /** A 1.06 scale impact pulse (a sweep landing on the pot). */
  bounce(): gsap.core.Timeline {
    this.bounceTl?.kill();
    const tl = gsap.timeline();
    if (this.motion.reducedMotion()) {
      this.bounceTl = null;
      return tl;
    }
    tl.eventCallback('onComplete', () => {
      if (this.bounceTl === tl) this.bounceTl = null;
    });
    const half = this.secs(BOUNCE_MS) / 2;
    tl.to(this.view.scale, { x: 1.06, y: 1.06, duration: half, ease: 'power2.out' });
    tl.to(this.view.scale, { x: 1, y: 1, duration: half, ease: 'power2.in' });
    this.bounceTl = tl;
    return tl;
  }

  /** Slide the whole stack to `target` (a street-end sweep into the pot),
   *  420ms `power2.in`. `onLand` fires on arrival (PokerScene bounces the pot
   *  and, for a transient sweep-ghost, destroys it). */
  sweepTo(target: Pt, onLand?: () => void): gsap.core.Timeline {
    this.tl?.kill();
    const tl = gsap.timeline();
    if (this.motion.reducedMotion()) {
      this.view.position.set(target.x, target.y);
      this.tl = null;
      onLand?.();
      return tl;
    }
    tl.eventCallback('onComplete', () => {
      if (this.tl === tl) this.tl = null;
      onLand?.();
    });
    tl.to(this.view, { x: target.x, y: target.y, duration: this.secs(SWEEP_MS), ease: 'power2.in' });
    this.tl = tl;
    return tl;
  }

  /** Glide to `target` (the winner's seat) over 500ms, splash 8 discs with a
   *  gravity fall (up then down, fading), then the cluster fades and clears.
   *  Reduced motion snaps straight to cleared. */
  pushTo(target: Pt): gsap.core.Timeline {
    this.tl?.kill();
    const tl = gsap.timeline();
    if (this.motion.reducedMotion()) {
      this.tl = null;
      this.clear();
      return tl;
    }
    tl.eventCallback('onComplete', () => {
      if (this.tl === tl) this.tl = null;
      this.clear();
    });

    const dur = this.secs(PUSH_MS);
    tl.to(this.view, { x: target.x, y: target.y, duration: dur, ease: 'power2.inOut' });

    const splashAt = dur;
    const splashDur = this.secs(SPLASH_MS);
    const mid = (SPLASH_COUNT - 1) / 2;
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const denom = SPLASH_DENOMS[i % SPLASH_DENOMS.length];
      const piece = this.makeDisc(denom);
      piece.width = this.discSize * 0.8;
      piece.height = this.discSize * 0.8;
      piece.position.set(0, 0);
      this.extra.push(piece);
      tl.add(() => this.view.addChild(piece), splashAt);
      const dx = Math.round(((i - mid) / mid) * 30 + (((i * 17) % 7) - 3));
      tl.to(piece, { x: dx, duration: splashDur, ease: 'power1.out' }, splashAt);
      tl.to(piece, { y: -40, duration: splashDur * 0.4, ease: 'power2.out' }, splashAt);
      tl.to(piece, { y: 20, duration: splashDur * 0.6, ease: 'power1.in' }, splashAt + splashDur * 0.4);
      tl.to(piece, { alpha: 0, duration: splashDur * 0.5, ease: 'power1.in' }, splashAt + splashDur * 0.5);
    }
    tl.to(
      this.view,
      { alpha: 0, duration: this.secs(PUSH_FADE_MS), ease: 'power1.out' },
      splashAt + splashDur * 0.6,
    );

    this.tl = tl;
    return tl;
  }

  /** Fast-forward any in-flight behavior to its end state (canvas-tap skip). */
  finish(): void {
    this.tl?.progress(1);
    this.bounceTl?.progress(1);
  }

  /** Kill any tween this actor owns (growth/sweep/push, bounce pulse) so
   *  nothing keeps ticking a display object the renderer is about to
   *  destroy. Mirrors CardActor.killTweens(); the view itself is freed by
   *  the scene's recursive app.destroy (or, for a sweep-ghost, an explicit
   *  view.destroy() by its owner). */
  killTweens(): void {
    this.tl?.kill();
    this.tl = null;
    this.bounceTl?.kill();
    this.bounceTl = null;
  }
}
