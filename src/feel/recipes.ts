// Static "recipe" table: pure declarative mapping from a FeelEvent (+ its
// derived Intensity) to an ordered list of Steps — channel, cue, params, and
// a 1x-speed ms offset. No scheduling, no side effects, no randomness; only
// director.ts turns these into actually-dispatched cues. Framework-free (no
// React) — src/feel stays a pure module tree.

import type { FeelEvent } from './events';
import type { Intensity, PayoutTier } from './intensity';

export type ChannelName = 'scene' | 'audio' | 'dom' | 'haptic';

/** Rendering fidelity gate for a Step (`minTier`):
 *  'full'    — full Pixi scene, every cosmetic layer.
 *  'reduced' — Pixi scene present, but cheaper/fewer effects.
 *  'dom'     — no Pixi scene at all (DOM-only fallback).
 *  Ranked full > reduced > dom for the `minTier` comparison (director.ts).
 *  Defined here (not quality.ts) per the plan; Task 8 imports it from this
 *  module. */
export type QualityTier = 'full' | 'reduced' | 'dom';

export interface Step {
  /** ms offset at 1x speed, relative to the event's dispatch. */
  at: number;
  channel: ChannelName;
  /** audio: a CUES key (src/audio/cues.ts) · scene: a SCENE_FX key (below,
   *  consumed by the Pixi scene's cue switch in Task 9+) · haptic: one of
   *  'tap' | 'heavy' | 'success'. */
  cue: string;
  params?: Record<string, unknown>;
  /** Minimum QualityTier required for this step to fire at all. Omit = always. */
  minTier?: QualityTier;
  /** How this step behaves when the user prefers reduced motion.
   *  Default (when omitted): 'drop' for scene steps, 'keep' for every other
   *  channel — reduced motion suppresses visual flourish, not audio/haptics. */
  reduced?: 'keep' | 'drop' | 'instant';
}

export type Recipe = Step[];

/** Canonical scene cue names. Shared by the recipe table (below) and the
 *  Pixi scene's cue switch (Task 9+) so the two can't silently drift apart —
 *  the validator test asserts every scene Step.cue is a member of this list. */
export const SCENE_FX = [
  'dealBoard',
  'dealHole',
  'betStack',
  'sweep',
  'winPush',
  'rimFlash',
  'confetti',
  'turnSpotlight',
  'dealRitual',
  'camPunch',
  'camZoomSeat',
  'camReset',
] as const;

/** HAND_START's deal-ritual duration in ms (1x speed). Task 10's gameStore
 *  adds its own DEAL_RITUAL_MS — the two must match; once it lands, Task 10
 *  flips this import direction (gameStore becomes the source of truth and
 *  this file imports it back) rather than this file exporting a duplicate. */
export const RITUAL_MS = 1100;

// Existing win-tier scaling, ported verbatim from useTableSfx / FreePlayScreen
// (src/ui/hooks/useTableSfx.ts, src/ui/screens/FreePlayScreen.tsx) — now
// owned here as the single place win-feedback intensity is defined.
const TIER_SEMITONES: Record<PayoutTier, number> = { small: 0, medium: 1, big: 2, monster: 4 };
const TIER_CLINKS: Record<PayoutTier, number> = { small: 2, medium: 3, big: 4, monster: 6 };
const CONFETTI_COUNT: Record<PayoutTier, number> = { small: 16, medium: 28, big: 38, monster: 56 };

// PayoutTier has 4 buckets, the chip-stack sample pool has 3 (S/M/L) — big
// and monster both read as the "large" stack; there's no louder cue above L.
// NOTE: intensityFor's ACTION case (src/feel/intensity.ts) currently always
// returns tier:'small' for bet/raise (it doesn't bucket by amountBB the way
// WIN/STREET_REVEAL do), so in practice this always resolves to chipStackS
// today. Recipe-level mapping is correct/future-proof regardless; flagged in
// the task report as a cross-module limitation, not something to patch here.
const CHIP_STACK_CUE: Record<PayoutTier, string> = {
  small: 'chipStackS',
  medium: 'chipStackM',
  big: 'chipStackL',
  monster: 'chipStackL',
};

// The chip-landing beat, preserved from Table.tsx's LAND_MS: bet pills sweep
// into the pot and visually land ~420ms after a street/hand resolves, so
// SWEEP's and WIN's chip clinks are cued on that same beat.
const LAND_MS = 420;
const CLINK_STAGGER_MS = 70;

export const RECIPES: Record<FeelEvent['type'], (e: FeelEvent, i: Intensity) => Recipe> = {
  HAND_START: (): Recipe => [
    { at: 0, channel: 'scene', cue: 'dealRitual', params: { durMs: RITUAL_MS } },
    { at: 0, channel: 'audio', cue: 'shuffle' },
    { at: 450, channel: 'audio', cue: 'dealWhoosh' },
    { at: 600, channel: 'audio', cue: 'dealWhoosh' },
    { at: 980, channel: 'audio', cue: 'cardThump' },
  ],

  ACTION: (e, i): Recipe => {
    const a = e as Extract<FeelEvent, { type: 'ACTION' }>;
    switch (a.action) {
      case 'fold':
        return [{ at: 0, channel: 'audio', cue: 'fold' }];

      case 'check':
        return [{ at: 0, channel: 'audio', cue: 'check' }];

      case 'call':
        return [
          { at: 0, channel: 'audio', cue: 'call' },
          { at: 60, channel: 'audio', cue: 'chipClink' },
        ];

      case 'bet':
      case 'raise':
        return [
          { at: 0, channel: 'audio', cue: a.action },
          {
            at: 0,
            channel: 'scene',
            cue: 'betStack',
            params: { slot: a.slot, amount: a.amountBB },
          },
          { at: 40, channel: 'audio', cue: CHIP_STACK_CUE[i.tier] },
          { at: 0, channel: 'haptic', cue: 'tap' },
        ];

      case 'allin':
        return [
          { at: 0, channel: 'audio', cue: 'allin' },
          {
            at: 0,
            channel: 'scene',
            cue: 'betStack',
            params: { slot: a.slot, amount: a.amountBB },
          },
          { at: 50, channel: 'scene', cue: 'rimFlash' },
          { at: 50, channel: 'scene', cue: 'camPunch' },
          { at: 0, channel: 'haptic', cue: 'heavy' },
        ];

      case 'postBlind':
        // Unreachable in practice: deriveFeelEvents (events.ts) filters
        // postBlind entries out before they ever become an ACTION FeelEvent.
        // Kept only so this switch is exhaustive over ActionType.
        return [];
    }
  },

  STREET_REVEAL: (e): Recipe => {
    const s = e as Extract<FeelEvent, { type: 'STREET_REVEAL' }>;
    const steps: Step[] = [
      { at: 0, channel: 'scene', cue: 'dealBoard', params: { count: s.count } },
      { at: 0, channel: 'audio', cue: 'cardSlide' },
      { at: 120, channel: 'audio', cue: 'cardFlip' },
    ];
    if (s.count === 3) {
      steps.push({ at: 240, channel: 'audio', cue: 'cardFlip' });
      steps.push({ at: 360, channel: 'audio', cue: 'cardFlip' });
    }
    return steps;
  },

  SWEEP: (e, i): Recipe => {
    const s = e as Extract<FeelEvent, { type: 'SWEEP' }>;
    const clinkCount = 1 + Math.round(2 * i.value);
    const steps: Step[] = [{ at: 0, channel: 'scene', cue: 'sweep', params: { from: s.from } }];
    for (let n = 0; n < clinkCount; n++) {
      steps.push({ at: LAND_MS + n * CLINK_STAGGER_MS, channel: 'audio', cue: 'chipClink' });
    }
    return steps;
  },

  TURN_START: (): Recipe => [
    { at: 0, channel: 'audio', cue: 'yourTurn' },
    { at: 0, channel: 'scene', cue: 'turnSpotlight' },
    { at: 0, channel: 'haptic', cue: 'tap' },
  ],

  WIN: (e, i): Recipe => {
    const w = e as Extract<FeelEvent, { type: 'WIN' }>;
    const steps: Step[] = [
      {
        at: 0,
        channel: 'scene',
        cue: 'winPush',
        params: { winnerSlot: w.winnerSlot, amount: w.amount },
      },
      { at: 120, channel: 'audio', cue: 'win', params: { semitones: TIER_SEMITONES[i.tier] } },
      {
        at: 150,
        channel: 'scene',
        cue: 'confetti',
        minTier: 'reduced',
        params: { count: CONFETTI_COUNT[i.tier] },
      },
    ];
    const clinkCount = TIER_CLINKS[i.tier];
    for (let n = 0; n < clinkCount; n++) {
      steps.push({ at: LAND_MS + n * CLINK_STAGGER_MS, channel: 'audio', cue: 'chipClink' });
    }
    if (w.heroWon) {
      steps.push({ at: 100, channel: 'haptic', cue: 'success' });
    }
    return steps;
  },

  HERO_BUST: (): Recipe => [{ at: 0, channel: 'audio', cue: 'lose' }],

  // Parked minimal — richer feedback (scene cue, haptic) lands in Phase 3.
  BOT_OUT: (): Recipe => [{ at: 0, channel: 'audio', cue: 'lock' }],
};
