/* Zero-asset synth voices.
 *
 * Every cue is synthesised from oscillators + filtered noise. Timbres:
 * glassy bells (inharmonic partials) for the "musical" cues, wood knocks and
 * felt taps for table actions, a detuned low-passed pad under the win chord,
 * and a noise riser + sub boom for all-in. Each voice routes to its bus (via
 * `busFor`) with an optional pan node ahead of it; the sfx bus also feeds the
 * engine's room reverb, so these sit "in the saloon" rather than in a void. */

import { ensureCtx, isMuted, type BusName } from './engine';

export type SynthName =
  | 'click'
  | 'chipClink'
  | 'cardDeal'
  | 'bet'
  | 'check'
  | 'call'
  | 'fold'
  | 'raise'
  | 'allin'
  | 'yourTurn'
  | 'win'
  | 'lose'
  | 'levelUp'
  | 'star'
  | 'lock'
  | 'incorrect'
  | 'chipTick';

export interface VoiceCtx {
  ctx: BaseAudioContext;
  dest: AudioNode;
}

// ---- low-level voices -------------------------------------------------------

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur: number;
  /** slide the frequency to this value over the note (exponential). */
  to?: number;
  gain?: number;
  attack?: number;
  /** start offset in seconds from now. */
  delay?: number;
  /** low-pass cutoff (Hz) — tames bright waveforms (saw/square). */
  lp?: number;
  /** second oscillator detuned by this many cents (chorus width). */
  detune?: number;
}

function tone(c: VoiceCtx, o: ToneOpts): void {
  const t0 = c.ctx.currentTime + (o.delay ?? 0);
  const g = c.ctx.createGain();
  const peak = o.gain ?? 0.5;
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

  let input: AudioNode = g;
  if (o.lp) {
    const lp = c.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lp;
    lp.Q.value = 0.7;
    lp.connect(g);
    input = lp;
  }
  const cents = o.detune ? [0, o.detune] : [0];
  for (const ct of cents) {
    const osc = c.ctx.createOscillator();
    osc.type = o.type ?? 'triangle';
    const k = Math.pow(2, ct / 1200);
    osc.frequency.setValueAtTime(o.freq * k, t0);
    if (o.to && o.to !== o.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to * k), t0 + o.dur);
    }
    osc.connect(input);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }
  g.connect(c.dest);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  /** filter centre/cutoff; omit for an unfiltered hiss. */
  band?: number;
  q?: number;
  /** filter type for `band` (default bandpass). */
  filter?: BiquadFilterType;
  /** sweep the filter to this frequency over the sound (risers). */
  sweepTo?: number;
  /** fade in over this many seconds instead of a hard start (risers). */
  attack?: number;
  delay?: number;
}

// One second of white noise per context, reused by every noise voice (no
// per-hit buffer allocation on busy moments like an all-in into a win).
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const frames = ctx.sampleRate;
    buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

function noise(c: VoiceCtx, o: NoiseOpts): void {
  const t0 = c.ctx.currentTime + (o.delay ?? 0);
  const src = c.ctx.createBufferSource();
  src.buffer = noiseBuffer(c.ctx);
  const g = c.ctx.createGain();
  const peak = o.gain ?? 0.4;
  if (o.attack) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + o.attack);
  } else {
    g.gain.setValueAtTime(peak, t0);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let node: AudioNode = src;
  if (o.band) {
    const f = c.ctx.createBiquadFilter();
    f.type = o.filter ?? 'bandpass';
    f.frequency.setValueAtTime(o.band, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.dur);
    f.Q.value = o.q ?? 1;
    node = src.connect(f);
  }
  node.connect(g).connect(c.dest);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

/** Bell materials: [partial ratio, level, decay] × 2 over a sine fundamental.
 *  0 glass (inharmonic, airy) · 1 bright metal (harmonic, ringing) ·
 *  2 marimba wood (high, fast-dying partials → round "tok"). */
const MATERIALS: readonly (readonly [number, number, number])[][] = [
  [[2.756, 0.28, 0.45], [5.404, 0.12, 0.18]],
  [[2.0, 0.34, 0.6], [3.0, 0.16, 0.35]],
  [[4.0, 0.22, 0.12], [9.2, 0.07, 0.05]],
];

/** Bell: sine fundamental + two partials from a material, decaying faster —
 *  the "ting" that makes cues read as polished, not beepy. `bright` scales
 *  the partials (tone colour per hit); `mat` picks the material. */
function bell(
  c: VoiceCtx,
  o: { freq: number; dur: number; gain: number; delay?: number; mat?: number; bright?: number },
): void {
  const bright = o.bright ?? 1;
  tone(c, { freq: o.freq, type: 'sine', dur: o.dur, gain: o.gain, attack: 0.003, delay: o.delay });
  for (const [ratio, level, decay] of MATERIALS[o.mat ?? 0]) {
    tone(c, {
      freq: o.freq * ratio,
      type: 'sine',
      dur: o.dur * decay,
      gain: Math.min(o.gain, o.gain * level * bright),
      attack: 0.002,
      delay: o.delay,
    });
  }
}

// ---- live variation ---------------------------------------------------------
// Real hands never hit the table the same way twice. Action voices change on
// every hit: pitched cues pick NEW NOTES from one shared pentatonic scale (so
// any mix stays consonant), bells switch material (glass / metal / marimba)
// and brightness, knocks and chips shift pitch and colour, and some cues pick
// one of several "takes" (never the same take twice in a row).

/** `x` nudged by up to ±`amt` (fraction), uniformly. */
export function jit(x: number, amt: number): number {
  return x * (1 + (Math.random() * 2 - 1) * amt);
}

const lastTake = new Map<string, number>();
/** Index in [0, n) for this hit — never repeats the previous take of `key`. */
export function take(key: string, n: number): number {
  const prev = lastTake.get(key);
  let i = Math.floor(Math.random() * (prev === undefined ? n : n - 1));
  if (prev !== undefined && i >= prev) i += 1;
  lastTake.set(key, i);
  return i;
}

/** C-major pentatonic from C5 upward (C D E G A, next octave …): `step`
 *  0 = C5, 1 = D5, 2 = E5, 3 = G5, 4 = A5, 5 = C6, … Any two steps sound
 *  good together, which is what lets every hit pick a different note. */
export function penta(step: number): number {
  const DEG = [0, 2, 4, 7, 9];
  const oct = Math.floor(step / 5);
  const semis = DEG[((step % 5) + 5) % 5] + 12 * oct;
  return 523.25 * Math.pow(2, semis / 12);
}

/** Per-hit bell colour: a material (not the last one used by `key`) and a brightness. */
function colour(key: string): { mat: number; bright: number } {
  return { mat: take(`${key}-mat`, MATERIALS.length), bright: jit(1, 0.45) };
}

/** Knuckle on wood: a fast pitch-dropping thump plus a short click. `wood`
 *  shifts the whole knock (lower = thicker table, higher = thin rail). */
function knock(c: VoiceCtx, delay = 0, gain = 0.42, wood = 1): void {
  const f = jit(230 * wood, 0.12);
  const g = jit(gain, 0.18);
  tone(c, { freq: f, to: f * jit(0.52, 0.15), type: 'sine', dur: jit(0.08, 0.2), gain: g, attack: 0.002, delay });
  noise(c, { dur: jit(0.025, 0.3), band: jit(1500 * wood, 0.3), q: jit(2.5, 0.4), gain: g * jit(0.45, 0.3), delay });
}

/** Clay-chip contact: two short metallic partials over a bright click.
 *  Chip size moves both partials together; a random third partial adds sheen. */
function clink(c: VoiceCtx, delay = 0, gain = 0.2): void {
  const k = jit(1, 0.14);
  const g = jit(gain, 0.2);
  noise(c, { dur: jit(0.03, 0.3), band: jit(5600, 0.2), q: 7, gain: g * 1.2, delay });
  tone(c, { freq: 3150 * k, type: 'sine', dur: jit(0.07, 0.3), gain: g * 0.6, attack: 0.001, delay: delay + 0.004 });
  tone(c, { freq: 4730 * k, type: 'sine', dur: jit(0.05, 0.3), gain: g * 0.35, attack: 0.001, delay: delay + 0.004 });
  if (Math.random() < 0.5) {
    tone(c, { freq: jit(6900, 0.1) * k, type: 'sine', dur: 0.03, gain: g * 0.2, attack: 0.001, delay: delay + 0.006 });
  }
}

// ---- cue recipes ------------------------------------------------------------

/** Per-cue playback options. `semitones` transposes pitched voices (the win
 *  arpeggio) so the same cue can scale with reward magnitude. */
export interface VoiceOpts {
  semitones?: number;
}

const NOTE = {
  C4: 261.63, E4: 329.63, G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, A5: 880, B5: 987.77,
  C6: 1046.5, E6: 1318.51, G6: 1567.98, B6: 1975.53, C7: 2093,
};

const VOICES: Record<SynthName, (c: VoiceCtx, o?: VoiceOpts) => void> = {
  // Crisp tick: a tiny falling blip over a high click.
  click: (c) => {
    const f = jit(1900, 0.1);
    tone(c, { freq: f, to: f * jit(0.68, 0.1), type: 'sine', dur: 0.035, gain: jit(0.16, 0.15), attack: 0.001 });
    noise(c, { dur: 0.015, band: jit(4200, 0.2), filter: 'highpass', gain: jit(0.16, 0.15) });
  },

  // Sometimes one or two more chips settle right after the first.
  chipClink: (c) => {
    clink(c);
    const t = take('chipClink', 3);
    if (t >= 1) clink(c, jit(0.045, 0.35), 0.09);
    if (t === 2) clink(c, jit(0.1, 0.25), 0.05);
  },

  // Tiny ratchet for slider drags — tighter and quieter than chipClink.
  chipTick: (c) => noise(c, { dur: 0.02, band: jit(5200, 0.15), q: 10, gain: jit(0.1, 0.2) }),

  cardDeal: (c) => {
    noise(c, { dur: jit(0.09, 0.25), band: jit(2800, 0.25), q: jit(0.8, 0.3), gain: jit(0.26, 0.15) });
    noise(c, { dur: 0.04, band: jit(7000, 0.15), q: 1.5, gain: jit(0.1, 0.3), delay: jit(0.02, 0.4) });
  },

  // Chips pushed forward: two scale notes (a consonant leap up) + a chip.
  bet: (c) => {
    const root = take('bet', 5); // C5 … C6
    const leap = 2 + take('bet-leap', 2); // up a 4th-ish or 5th-ish
    const col = colour('bet');
    bell(c, { freq: penta(root), dur: jit(0.38, 0.2), gain: jit(0.19, 0.12), ...col });
    bell(c, { freq: penta(root + leap), dur: jit(0.42, 0.2), gain: jit(0.12, 0.2), delay: jit(0.06, 0.35), ...col });
    clink(c, jit(0.03, 0.4), 0.16);
  },

  // Takes: two even knocks · a firm knock then a light one · a quick triple
  // tap · a heavy single knock with a soft echo. The wood changes per hit.
  check: (c) => {
    const t = take('check', 4);
    const wood = jit(1, 0.2);
    const gap = jit(0.11, 0.25);
    knock(c, 0, t === 3 ? 0.42 : 0.36, wood);
    if (t === 3) {
      knock(c, gap * 1.4, 0.12, wood * 1.15);
      return;
    }
    knock(c, gap, t === 1 ? 0.24 : 0.34, wood * jit(1, 0.06));
    if (t === 2) knock(c, gap * 1.8, 0.2, wood * 1.1);
  },

  // Matching the bet: one scale note in a random colour + a chip (sometimes two).
  call: (c) => {
    bell(c, { freq: penta(1 + take('call', 5)), dur: jit(0.4, 0.2), gain: jit(0.2, 0.12), ...colour('call') });
    clink(c, jit(0.02, 0.5), 0.15);
    if (take('call-chip', 2) === 0) clink(c, jit(0.07, 0.3), 0.07);
  },

  // Cards slid away: a felt swish (sometimes a double flick) and a low tap.
  fold: (c) => {
    const len = jit(0.16, 0.3);
    const top = jit(1800, 0.35);
    noise(c, { dur: len, band: top, sweepTo: top * jit(0.28, 0.3), filter: 'lowpass', q: jit(0.7, 0.4), gain: jit(0.2, 0.15) });
    if (take('fold', 3) === 0) {
      noise(c, { dur: len * 0.6, band: top * 1.2, sweepTo: top * 0.4, filter: 'lowpass', q: 0.7, gain: 0.1, delay: len * 0.55 });
    }
    const f = jit(150, 0.18);
    tone(c, { freq: f, to: f * jit(0.63, 0.15), type: 'sine', dur: jit(0.09, 0.25), gain: jit(0.16, 0.2), delay: len * 0.3 });
  },

  // Rising three scale notes from a random start, random speed and colour.
  raise: (c) => {
    const start = take('raise', 4); // C5 … G5
    const stride = 1 + take('raise-stride', 2); // stepwise or skipping
    const step = jit(0.055, 0.3);
    const col = colour('raise');
    for (let i = 0; i < 3; i++) {
      bell(c, { freq: penta(start + i * stride), dur: jit(0.4, 0.15), gain: jit(0.15, 0.12), delay: i * step, ...col });
    }
    noise(c, { dur: 0.18, band: jit(1500, 0.3), sweepTo: jit(6000, 0.2), q: 1.2, gain: 0.07, attack: 0.12 });
    clink(c, step * 3, 0.14);
  },

  // Tension riser → sub boom → a dark, wide chord (one of four).
  allin: (c) => {
    noise(c, { dur: 0.45, band: jit(400, 0.2), sweepTo: jit(5200, 0.15), q: 1.4, gain: 0.2, attack: 0.38 });
    tone(c, { freq: jit(95, 0.12), to: 42, type: 'sine', dur: jit(0.7, 0.15), gain: 0.34, attack: 0.005, delay: 0.4 });
    const CHORDS = [
      [NOTE.A4 / 2, NOTE.C4, NOTE.E4, NOTE.A4], // A minor
      [146.83, 174.61, 220, 293.66], // D minor
      [164.81, 196, 246.94, NOTE.E4], // E minor
      [174.61, 220, NOTE.C4, NOTE.E4], // F major 7
    ];
    for (const f of CHORDS[take('allin', CHORDS.length)]) {
      tone(c, { freq: f, type: 'sawtooth', dur: 1.1, gain: 0.05, attack: 0.02, lp: jit(1400, 0.3), detune: jit(9, 0.4), delay: 0.4 });
    }
    bell(c, { freq: penta(take('allin-top', 3)), dur: 0.9, gain: 0.12, delay: 0.42, ...colour('allin') });
  },

  // "Your move": two bells a fifth apart, from one of three roots.
  yourTurn: (c) => {
    const root = [NOTE.A5, NOTE.G5, NOTE.C6][take('yourTurn', 3)];
    const col = colour('yourTurn');
    bell(c, { freq: root, dur: jit(0.5, 0.12), gain: jit(0.2, 0.1), ...col });
    bell(c, { freq: root * 1.4983, dur: jit(0.65, 0.12), gain: jit(0.16, 0.12), delay: jit(0.11, 0.25), ...col });
  },

  win: (c, o) => {
    // Bell arpeggio C5–E5–G5–C6 over a soft pad, then a sparkle — all
    // transposed up by o.semitones for bigger pots.
    const k = Math.pow(2, (o?.semitones ?? 0) / 12); // equal-temperament transpose
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
      bell(c, { freq: f * k, dur: 0.75 - i * 0.05, gain: 0.18, delay: i * 0.075 }),
    );
    [NOTE.C4, NOTE.E4, NOTE.G4].forEach((f) =>
      tone(c, { freq: f * k, type: 'triangle', dur: 1.3, gain: 0.07, attack: 0.03, lp: 2400, detune: 7, delay: 0.05 }),
    );
    [NOTE.E6, NOTE.G6, NOTE.C7, NOTE.G6].forEach((f, i) =>
      tone(c, { freq: f * k * 2, type: 'sine', dur: 0.22, gain: 0.035, attack: 0.002, delay: 0.32 + i * 0.06 }),
    );
  },

  // Soft falling minor bells with a low root — sad, not harsh.
  lose: (c) => {
    [NOTE.G4, NOTE.E4, NOTE.C4].forEach((f, i) =>
      tone(c, { freq: f, type: 'sine', dur: 0.45, gain: 0.22, attack: 0.015, delay: i * 0.13 }),
    );
    tone(c, { freq: NOTE.C4 / 2, type: 'triangle', dur: 0.7, gain: 0.12, attack: 0.02, lp: 900, delay: 0.26 });
  },

  levelUp: (c) => {
    [NOTE.C5, NOTE.F5, NOTE.A5, NOTE.C6].forEach((f, i) =>
      bell(c, { freq: f * 1.335, dur: 0.6, gain: 0.2, delay: i * 0.065 }),
    );
    [NOTE.C7, NOTE.E6 * 2].forEach((f, i) =>
      tone(c, { freq: f, type: 'sine', dur: 0.25, gain: 0.04, delay: 0.3 + i * 0.07 }),
    );
  },

  star: (c) => {
    bell(c, { freq: NOTE.E6, dur: 0.45, gain: 0.2 });
    bell(c, { freq: NOTE.B6, dur: 0.4, gain: 0.1, delay: 0.04 });
  },

  // Heavy latch: a low thunk and a metal click.
  lock: (c) => {
    tone(c, { freq: 130, to: 70, type: 'sine', dur: 0.16, gain: 0.3, attack: 0.002 });
    noise(c, { dur: 0.04, band: 2600, q: 3, gain: 0.16, delay: 0.03 });
  },

  // Gentle "not quite" for a quiz miss — soft falling two-note, deliberately
  // NOT the bleak descending `lose` (a wrong answer is teaching, not a
  // stack-loss punishment).
  incorrect: (c) => {
    tone(c, { freq: NOTE.G4, type: 'sine', dur: 0.14, gain: 0.2, attack: 0.008 });
    tone(c, { freq: 349.23, type: 'sine', dur: 0.2, gain: 0.18, attack: 0.008, delay: 0.1 });
  },
};

// Runtime view of the valid SynthName set — lets cues.ts (Task 5) validate
// its fallback recipes actually exist without a second hand-maintained list.
export const SYNTH_NAMES: readonly SynthName[] = Object.keys(VOICES) as SynthName[];

/** Render a voice into any context/destination (offline measurement, tests). */
export function renderVoice(name: SynthName, c: VoiceCtx, opts?: VoiceOpts): void {
  VOICES[name](c, opts);
}

// Which bus each voice routes to. UI micro-feedback (clicks/ticks/lock/miss)
// sits on its own bus from the felt sounds (bets/deals/wins/…) so a settings
// panel (Task 7) can balance them independently.
const UI_VOICES: ReadonlySet<SynthName> = new Set(['click', 'chipTick', 'lock', 'incorrect']);

function busFor(name: SynthName): BusName {
  return UI_VOICES.has(name) ? 'ui' : 'sfx';
}

// ---- public API -------------------------------------------------------------

export function playSynth(name: SynthName, opts?: VoiceOpts & { pan?: number }): void {
  if (isMuted()) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.ctx.state === 'suspended') void c.ctx.resume();
  const busNode = c.bus(busFor(name));
  let dest: AudioNode = busNode;
  if (opts?.pan !== undefined) {
    const panner = c.ctx.createStereoPanner();
    panner.pan.value = opts.pan;
    panner.connect(busNode);
    dest = panner;
  }
  try {
    VOICES[name]({ ctx: c.ctx, dest }, opts);
  } catch (e) {
    // Never let SFX break the UI, but don't swallow the cause — a voice that
    // throws is a real bug worth surfacing (rare: only on a killed node graph).
    console.warn('[sfx] playback failed:', name, e);
  }
}
