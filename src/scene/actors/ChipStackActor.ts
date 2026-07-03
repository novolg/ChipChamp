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

export interface ChipColumnRemove {
  col: number;
  row: number;
}

/**
 * The per-column delta from `prev` to `next`, split at each column's longest
 * common bottom-up prefix:
 *  - `added` — discs `next` has ABOVE the shared prefix (the new chips a re-bet
 *    arcs in, per "diff columns, only new discs animate").
 *  - `removed` — discs `prev` had above the shared prefix: a prefix BREAK (the
 *    greedy breakdown of the larger amount is NOT a per-column extension of the
 *    smaller — e.g. `[[10,10]]` (20) → `[[25],[10],[5]]` (40), where col0's
 *    bottom disc itself changes denom), OR a surplus row/column the new
 *    composition no longer has.
 * The apply MUST destroy every `removed` sprite; otherwise a broken-prefix
 * re-bet overwrites live sprite references, leaking detached discs at stale
 * positions and leaving surplus rows on screen. Pure.
 */
export function chipColumnDiff(
  prev: ChipDenom[][],
  next: ChipDenom[][],
): { added: ChipColumnAdd[]; removed: ChipColumnRemove[] } {
  const added: ChipColumnAdd[] = [];
  const removed: ChipColumnRemove[] = [];
  const cols = Math.max(prev.length, next.length);
  for (let col = 0; col < cols; col++) {
    const prevCol = prev[col] ?? [];
    const nextCol = next[col] ?? [];
    let p = 0;
    while (p < prevCol.length && p < nextCol.length && prevCol[p] === nextCol[p]) p++;
    for (let row = p; row < prevCol.length; row++) removed.push({ col, row });
    for (let row = p; row < nextCol.length; row++) added.push({ col, row, denom: nextCol[row] });
  }
  return { added, removed };
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
 *
 * State machine (the settle↔fx race is the reason it needs three fields):
 * TableScene schedules fx cues async (`gsap.delayedCall`) but calls
 * `PokerScene.sync` — hence `place` — SYNCHRONOUSLY right after. So on an
 * ordinary raise with the deal timeline idle, `place(newAmount)` runs BEFORE
 * `grow(newAmount)`. To keep the arc visible on that path, the fields decouple
 * "what's built" from "what a grow may still animate":
 *  - `amount`     — composition truth (what the stack is built to). Written by
 *                   `place`(arg) and `grow`(arg, at start).
 *  - `animatedTo` — diff base for the NEXT grow. Advanced ONLY on a grow that
 *                   COMPLETES or snaps (reduced motion); `place` NEVER advances
 *                   it — instead it records the amount it is REPLACING, so the
 *                   grow scheduled for the same settle still sees the pre-bet
 *                   composition and animates the delta. Reset to 0 by `clear`.
 *  - `dirty`      — set by `killTweens` when a behavior is aborted mid-flight
 *                   (setMode / teardown), so `amount` names a target the stack
 *                   never actually reached; forces the next `place` to rebuild
 *                   (hard-resetting position/scale/alpha) instead of no-opping.
 */
export class ChipStackActor {
  readonly view = new Container();

  private home: Pt = { x: 0, y: 0 };
  private discSize = 20;
  /** Composition truth: the amount the stack is currently BUILT to. */
  private amount = 0;
  /** Diff base for the next `grow` (the composition a grow rewinds to before
   *  animating the delta). Advanced only when a grow completes/snaps; `place`
   *  records the amount it REPLACES here, never the amount it sets — see the
   *  class-level state-machine note. Reset to 0 by `clear`. */
  private animatedTo = 0;
  /** True when a behavior tween was killed mid-flight (killTweens) rather than
   *  completing: the view is frozen at stale coords/alpha/scale and `amount`
   *  still names the aborted target, so the plain amount-equality guard in
   *  `place` would wrongly no-op. While dirty, the next `place` is forced to
   *  rebuild + hard-reset; it then clears the flag. */
  private dirty = false;
  private sprites: Sprite[][] = [];
  /** Transient splash-only sprites (winPush), cleared alongside the main
   *  composition — never part of the `sprites` bookkeeping. */
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
    this.view.removeChildren();
    this.view.visible = false;
    this.view.alpha = 1;
    this.view.scale.set(1);
    this.view.position.set(this.home.x, this.home.y);
    this.amount = 0;
    this.animatedTo = 0;
    this.dirty = false;
  }

  /** Rebuild from scratch (instant, no tween) to match `cols`. Destroys any
   *  splash leftovers too, so a rebuild after a killed `pushTo` can't strand
   *  detached `extra` sprites on the view. */
  private rebuild(cols: ChipDenom[][]): void {
    for (const col of this.sprites) for (const s of col) s.destroy();
    for (const s of this.extra) s.destroy();
    this.extra = [];
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
  }

  /** Settle-to-truth: hard-set to `amount`, no animation. Safe to call on every
   *  sync regardless of what's in flight:
   *   - while a behavior tween owns the actor, leave it be if it's heading to
   *     the same truth (don't tear down a live grow whose target already equals
   *     `amount`); hard-correct only when truth has diverged from that target;
   *   - once settled here, subsequent calls no-op (idempotent) — UNLESS a
   *     killed tween left us `dirty`, in which case `amount` names a target the
   *     stack never reached and we must rebuild.
   *  Deliberately does NOT advance `animatedTo` to the amount it sets: it
   *  records the amount it REPLACES, so a `grow` scheduled for this same
   *  synchronous settle still diffs against the pre-bet composition and its arc
   *  stays visible (see the class-level state-machine note). */
  place(amount: number): void {
    if (this.tl) {
      if (amount === this.amount) return;
      this.tl.kill();
      this.tl = null;
    }
    if (!this.dirty && amount === this.amount) return;
    if (amount <= 0) {
      this.clear();
      return;
    }
    // Baseline for a future grow = the picture being replaced. After a dirty
    // repair there's no pending grow to feed, so catch the baseline fully up.
    this.animatedTo = this.dirty ? amount : this.amount;
    this.rebuild(chipColumns(amount));
    this.view.position.set(this.home.x, this.home.y);
    this.view.scale.set(1);
    this.view.alpha = 1;
    this.view.visible = true;
    this.amount = amount;
    this.dirty = false;
  }

  /** Animated re-bet: rewind to the last fully-animated composition
   *  (`animatedTo`, which the synchronous settle deliberately did NOT advance),
   *  then arc only the NEW discs in from `from` (the seat), 200ms
   *  `back.out(1.4)`, staggered 40ms — even though `place` already hard-set the
   *  post-bet stack. Surviving prefix discs stay put (re-centered for the new
   *  column count); discs the new composition drops (prefix break / surplus)
   *  are destroyed. Reduced motion (or a non-positive target) snaps. */
  grow(amount: number, from: Pt): gsap.core.Timeline {
    this.tl?.kill();
    this.tl = null;
    const tl = gsap.timeline();
    if (this.motion.reducedMotion() || amount <= 0) {
      // A snapped grow is fully caught up — advance the diff base to match so a
      // later (non-reduced) grow doesn't re-animate discs already on the felt.
      this.place(amount);
      this.animatedTo = this.amount;
      return tl;
    }

    const prevCols = chipColumns(this.animatedTo);
    const nextCols = chipColumns(amount);
    this.rebuild(prevCols);
    this.view.position.set(this.home.x, this.home.y);
    this.view.scale.set(1);
    this.view.alpha = 1;
    this.view.visible = true;

    const { added, removed } = chipColumnDiff(prevCols, nextCols);
    // Destroy every disc the new composition drops (prefix break or surplus
    // row/column) so nothing is left detached at a stale position.
    for (const { col, row } of removed) this.sprites[col]?.[row]?.destroy();

    const localFrom = { x: from.x - this.home.x, y: from.y - this.home.y };
    const addedKeys = new Set(added.map((a) => `${a.col}:${a.row}`));
    // Retarget the sprite grid to the new composition: reuse surviving prefix
    // discs (instantly re-centered for the possibly-changed column count), and
    // park each added disc at the seat to be arced in below.
    this.sprites = nextCols.map((col, c) =>
      col.map((denom, r) => {
        const isAdded = addedKeys.has(`${c}:${r}`);
        const survivor = isAdded ? undefined : this.sprites[c]?.[r];
        const rest = this.discPos(c, r, nextCols.length);
        if (survivor) {
          survivor.position.set(rest.x, rest.y);
          return survivor;
        }
        const sprite = this.makeDisc(denom);
        sprite.position.set(isAdded ? localFrom.x : rest.x, isAdded ? localFrom.y : rest.y);
        this.view.addChild(sprite);
        return sprite;
      }),
    );

    added.forEach(({ col, row }, i) => {
      const sprite = this.sprites[col][row];
      const to = this.discPos(col, row, nextCols.length);
      const at = this.secs(i * GROW_STAGGER_MS);
      tl.to(
        sprite.position,
        { x: to.x, y: to.y, duration: this.secs(GROW_MS), ease: 'back.out(1.4)' },
        at,
      );
    });

    this.amount = amount;
    this.dirty = false;
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
   *  view.destroy() by its owner). Marks the actor `dirty`: a killed behavior
   *  left the view frozen mid-flight (stale coords/alpha/scale, and `amount`
   *  naming a target it never reached — e.g. a mid-push pot cluster or a
   *  1.06-scale-stuck bounce), so the next settle must rebuild rather than
   *  no-op it. (For a full teardown the view is destroyed anyway; harmless.) */
  killTweens(): void {
    this.tl?.kill();
    this.tl = null;
    this.bounceTl?.kill();
    this.bounceTl = null;
    this.dirty = true;
  }
}
