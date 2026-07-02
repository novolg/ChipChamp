/* Cue registry: maps every playable sound name to its bus, its optional
 * sample pool (basenames resolved against `/audio/manifest.json` — see
 * `samples.ts`), and its synth fallback recipe (`synth.ts`'s `SynthName`).
 *
 * Of the 17 existing SfxNames, two physical felt sounds (`chipClink`,
 * `cardDeal`) get sample pools — the Phase-1 sample set names them
 * explicitly ("chip clink ×4", card slide foley). The other 15 stay
 * synth-only (`pool` omitted): the ui-bus ticks plus the musical/abstract
 * cues (win/lose/levelUp/…) already have hand-tuned recipes and aren't
 * foley. Each entry's `bus` matches `synth.ts`'s own internal `busFor`
 * mapping exactly (click/chipTick/lock/incorrect -> 'ui', everything else
 * -> 'sfx'); for pool-less cues `playCue` always resolves through
 * `playSynth`, which computes its own bus.
 *
 * The 12 new cues are physical table sounds (cards/chips/felt) introduced
 * for real recorded foley (see the premium game-feel proposal). None has a
 * dedicated synth voice, so each borrows the closest existing `SynthName`
 * recipe as its permanent fallback — used today (zero samples committed
 * until Task 14) and forever after any bank load failure.
 */

import type { BusName } from './engine';
import type { SynthName } from './synth';

export interface CueDef {
  bus: BusName;
  /** Sample basenames in /audio/ (see manifest.json). Omitted = synth-only. */
  pool?: string[];
  synth: SynthName;
}

export const CUES: Record<string, CueDef> = {
  // ---- existing 17 SfxNames — chipClink/cardDeal pooled, rest synth-only ----
  click: { bus: 'ui', synth: 'click' },
  chipClink: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['chip-clink-1.mp3', 'chip-clink-2.mp3', 'chip-clink-3.mp3', 'chip-clink-4.mp3'],
  },
  cardDeal: {
    bus: 'sfx',
    synth: 'cardDeal',
    pool: ['card-slide-1.mp3', 'card-slide-2.mp3'],
  },
  bet: { bus: 'sfx', synth: 'bet' },
  check: { bus: 'sfx', synth: 'check' },
  call: { bus: 'sfx', synth: 'call' },
  fold: { bus: 'sfx', synth: 'fold' },
  raise: { bus: 'sfx', synth: 'raise' },
  allin: { bus: 'sfx', synth: 'allin' },
  yourTurn: { bus: 'sfx', synth: 'yourTurn' },
  win: { bus: 'sfx', synth: 'win' },
  lose: { bus: 'sfx', synth: 'lose' },
  levelUp: { bus: 'sfx', synth: 'levelUp' },
  star: { bus: 'sfx', synth: 'star' },
  lock: { bus: 'ui', synth: 'lock' },
  incorrect: { bus: 'ui', synth: 'incorrect' },
  chipTick: { bus: 'ui', synth: 'chipTick' },

  // ---- new physical-foley cues — pool + a plausible synth fallback ----
  shuffle: {
    bus: 'sfx',
    synth: 'cardDeal',
    pool: ['shuffle-riffle-1.mp3', 'shuffle-riffle-2.mp3'],
  },
  dealWhoosh: {
    bus: 'sfx',
    synth: 'cardDeal',
    pool: ['deal-whoosh-1.mp3', 'deal-whoosh-2.mp3'],
  },
  cardSlide: {
    bus: 'sfx',
    synth: 'cardDeal',
    pool: ['card-slide-solo-1.mp3', 'card-slide-solo-2.mp3', 'card-slide-solo-3.mp3'],
  },
  cardFlip: {
    bus: 'sfx',
    synth: 'cardDeal',
    pool: ['card-flip-1.mp3', 'card-flip-2.mp3'],
  },
  cardThump: {
    bus: 'sfx',
    synth: 'cardDeal',
    pool: ['card-thump-1.mp3', 'card-thump-2.mp3'],
  },
  chipStackS: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['chip-stack-small-1.mp3', 'chip-stack-small-2.mp3'],
  },
  chipStackM: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['chip-stack-medium-1.mp3', 'chip-stack-medium-2.mp3'],
  },
  chipStackL: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['chip-stack-large-1.mp3', 'chip-stack-large-2.mp3'],
  },
  chipSplash: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['chip-splash-1.mp3', 'chip-splash-2.mp3'],
  },
  potPour: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['pot-pour-1.mp3', 'pot-pour-2.mp3'],
  },
  feltThud: {
    bus: 'sfx',
    synth: 'lock',
    pool: ['felt-thud-1.mp3', 'felt-thud-2.mp3'],
  },
  buttonClack: {
    bus: 'sfx',
    synth: 'chipClink',
    pool: ['button-clack-1.mp3', 'button-clack-2.mp3'],
  },
};
