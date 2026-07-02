// Turns FeelEvents into scheduled channel dispatches, gated by speed,
// reduced-motion, and render-quality-tier settings. Pure orchestration: it
// owns no cues/timings itself (recipes.ts does) and no rendering (Channels,
// injected by the caller, does). The only framework-adjacent bit is the
// default scheduler (gsap.delayedCall) — callers that inject their own
// `schedule` (all tests) never touch gsap.

import gsap from 'gsap';
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

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const tween = gsap.delayedCall(Math.max(0, ms) / 1000, fn);
  return () => tween.kill();
};

export function createDirector(ch: Channels, opts: DirectorOpts) {
  const schedule = opts.schedule ?? defaultSchedule;

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
