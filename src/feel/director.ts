// Turns FeelEvents into scheduled channel dispatches, gated by speed,
// reduced-motion, and render-quality-tier settings. Pure orchestration: it
// owns no cues/timings itself (recipes.ts does) and no rendering (Channels,
// injected by the caller, does). The only framework-adjacent bit is the
// default scheduler (gsap.delayedCall) — lazily imported on first use, so
// callers that inject their own `schedule` (all tests) never load gsap's
// module code at all.

import type { GameState } from '../engine/types';
import type { FeelEvent } from './events';
import { intensityFor, type Intensity } from './intensity';
import { RECIPES, type ChannelName, type QualityTier } from './recipes';

// The brief's interface sketch (`interface Channels { [K in ChannelName]: … }`)
// is a mapped type and TS rejects mapped-type members inside `interface`
// (TS7061: "A mapped type may not declare properties or methods."); a `type`
// alias with the identical shape is the valid realization of the same contract.
export type Channels = {
  [K in ChannelName]: (cue: string, params: Record<string, unknown>, i: Intensity) => void;
};

export interface DirectorOpts {
  /** 0.5 | 1 | 2 — divides every Step's `at` before scheduling. */
  speed: () => number;
  reducedMotion: () => boolean;
  tier: () => QualityTier;
  /** Default: gsap.delayedCall(ms/1000, fn), returning a `.kill()` cancel fn.
   *  Tests inject their own (immediate or recording) scheduler so no GSAP
   *  runs in node tests. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

// 'dom' is the least capable render tier, 'full' the most — a Step's
// `minTier` gate compares ranks: skip when the current tier ranks below it.
const TIER_RANK: Record<QualityTier, number> = { dom: 0, reduced: 1, full: 2 };

// Reduced-motion default per channel: scene effects are motion, so they're
// dropped unless a Step opts in; audio/haptic/dom aren't "motion" and keep
// firing unless a Step explicitly opts out.
const DEFAULT_REDUCED: Record<ChannelName, 'keep' | 'drop' | 'instant'> = {
  scene: 'drop',
  audio: 'keep',
  dom: 'keep',
  haptic: 'keep',
};

// gsap is loaded lazily (dynamic import, cached) so that a director with an
// injected scheduler never executes gsap's module code — type-only references
// below don't load anything. createDirector warms the cache up front when the
// default scheduler will be used, so the async load has normally settled long
// before the first step is scheduled.
type Gsap = (typeof import('gsap'))['gsap'];
let gsapCache: Gsap | null = null;
let gsapLoading: Promise<Gsap | null> | null = null;

const loadGsap = (): Promise<Gsap | null> =>
  (gsapLoading ??= import('gsap').then(
    (m) => (gsapCache = m.gsap),
    (err: unknown) => {
      // I/O boundary: with code splitting this is a network chunk fetch and
      // can fail. Warn once; default-scheduled steps are then dropped
      // (cosmetic layer only — never let feel-FX break the app).
      console.warn('[feel] gsap failed to load; default-scheduled steps dropped:', err);
      return null;
    },
  ));

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  let cancelled = false;
  let tween: { kill: () => void } | null = null;
  const start = (g: Gsap | null): void => {
    if (!g || cancelled) return;
    tween = g.delayedCall(Math.max(0, ms) / 1000, fn);
  };
  if (gsapCache) start(gsapCache);
  else void loadGsap().then(start); // first-use only: delay starts once loaded
  return () => {
    cancelled = true;
    tween?.kill();
  };
};

export function createDirector(ch: Channels, opts: DirectorOpts) {
  const schedule = opts.schedule ?? defaultSchedule;
  // Warm the gsap cache only when the default scheduler is actually in play.
  if (!opts.schedule) void loadGsap();

  // Each pending entry is a stable object so a step that fires synchronously
  // (an "immediate" test scheduler) can remove itself from `pending` before
  // its own `schedule(...)` call has even returned a cancel fn — assigning
  // into `box.cancel` after the fact is then a harmless no-op instead of a
  // stale entry leaking forever.
  let pending: { cancel: () => void }[] = [];

  const cancelAll = (): void => {
    const toCancel = pending;
    pending = [];
    for (const box of toCancel) box.cancel();
  };

  const dispatch = (events: FeelEvent[], game: GameState): void => {
    for (const e of events) {
      // A new hand supersedes every in-flight cosmetic/audio step from the
      // previous one (mirrors the old useTableSfx's per-hand timer reset).
      if (e.type === 'HAND_START') cancelAll();

      const i: Intensity = intensityFor(e, game);
      const recipe = RECIPES[e.type](e, i);

      for (const step of recipe) {
        if (step.minTier && TIER_RANK[opts.tier()] < TIER_RANK[step.minTier]) continue;

        let at = step.at;
        if (opts.reducedMotion()) {
          const mode = step.reduced ?? DEFAULT_REDUCED[step.channel];
          if (mode === 'drop') continue;
          if (mode === 'instant') at = 0;
        }

        const ms = at / opts.speed();
        const box = { cancel: (): void => {} };
        pending.push(box);
        box.cancel = schedule(() => {
          pending = pending.filter((b) => b !== box);
          ch[step.channel](step.cue, step.params ?? {}, i);
        }, ms);
      }
    }
  };

  return { dispatch, cancelAll };
}
