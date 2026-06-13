/* Zero-asset SFX engine.
 *
 * Every cue is synthesised from oscillators + filtered noise through one shared
 * AudioContext, so there are no audio files to ship, no network, no licensing.
 * The context is created lazily and resumed on the first user gesture (browser
 * autoplay policy). Mute state persists in localStorage and is independent of
 * prefers-reduced-motion — visual motion and sound are governed separately. */

export type SfxName =
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
  | 'lock';

const STORAGE_KEY = 'cc.muted';
const MASTER_GAIN = 0.22; // keep cues subtle — this is a learning app, not a casino

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<(m: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Create (once) and return the context + master gain, or null if unsupported. */
function ensureCtx(): { ctx: AudioContext; master: GainNode } | null {
  if (ctx && master) return { ctx, master };
  const Ctor =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  // Gentle brick-wall limiter: protects the busiest cues (all-in into a win,
  // ~11 stacked voices) from clipping. Threshold sits above any single cue's
  // peak, so a lone click and the win arpeggio are unchanged — only stacked
  // voices duck. ~zero CPU; the standard pro fix.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);
  return { ctx, master };
}

/** Resume a suspended context — wired to the first gesture below. */
function unlock(): void {
  const c = ensureCtx();
  if (c && c.ctx.state === 'suspended') void c.ctx.resume();
}

if (typeof window !== 'undefined') {
  const onGesture = () => unlock();
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture, { passive: true });
  window.addEventListener('touchstart', onGesture, { passive: true });
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
}

function tone(c: { ctx: AudioContext; master: GainNode }, o: ToneOpts): void {
  const t0 = c.ctx.currentTime + (o.delay ?? 0);
  const osc = c.ctx.createOscillator();
  const g = c.ctx.createGain();
  const peak = o.gain ?? 0.5;
  const attack = o.attack ?? 0.004;
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to && o.to !== o.freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(c.master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  /** bandpass centre; omit for an unfiltered hiss. */
  band?: number;
  q?: number;
  delay?: number;
}

function noise(c: { ctx: AudioContext; master: GainNode }, o: NoiseOpts): void {
  const t0 = c.ctx.currentTime + (o.delay ?? 0);
  const frames = Math.floor(c.ctx.sampleRate * o.dur);
  const buf = c.ctx.createBuffer(1, frames, c.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.ctx.createBufferSource();
  src.buffer = buf;
  const g = c.ctx.createGain();
  const peak = o.gain ?? 0.4;
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  let node: AudioNode = src;
  if (o.band) {
    const bp = c.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.band;
    bp.Q.value = o.q ?? 1;
    node = src.connect(bp);
  }
  node.connect(g).connect(c.master);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

// ---- cue recipes ------------------------------------------------------------

/** Per-cue playback options. `semitones` transposes pitched voices (the win
 *  arpeggio) so the same cue can scale with reward magnitude. */
export interface VoiceOpts {
  semitones?: number;
}

const VOICES: Record<SfxName, (c: { ctx: AudioContext; master: GainNode }, o?: VoiceOpts) => void> = {
  click: (c) => tone(c, { freq: 660, to: 880, type: 'triangle', dur: 0.05, gain: 0.3 }),

  chipClink: (c) => {
    noise(c, { dur: 0.04, band: 5200, q: 6, gain: 0.28 });
    tone(c, { freq: 2400, type: 'triangle', dur: 0.05, gain: 0.16, delay: 0.012 });
  },

  cardDeal: (c) => {
    noise(c, { dur: 0.09, band: 3000, q: 0.8, gain: 0.3 });
    noise(c, { dur: 0.05, band: 6000, q: 1.5, gain: 0.12, delay: 0.02 });
  },

  bet: (c) => {
    tone(c, { freq: 420, to: 640, type: 'triangle', dur: 0.1, gain: 0.32 });
    noise(c, { dur: 0.04, band: 5000, q: 5, gain: 0.18, delay: 0.02 });
  },

  check: (c) => {
    tone(c, { freq: 180, type: 'sine', dur: 0.06, gain: 0.34 });
    tone(c, { freq: 170, type: 'sine', dur: 0.06, gain: 0.3, delay: 0.1 });
  },

  call: (c) => tone(c, { freq: 520, to: 560, type: 'triangle', dur: 0.09, gain: 0.32 }),

  fold: (c) => {
    tone(c, { freq: 380, to: 150, type: 'sawtooth', dur: 0.16, gain: 0.16 });
    noise(c, { dur: 0.12, band: 1600, q: 0.6, gain: 0.14 });
  },

  raise: (c) => {
    tone(c, { freq: 480, to: 820, type: 'triangle', dur: 0.13, gain: 0.32 });
    tone(c, { freq: 960, to: 1240, type: 'triangle', dur: 0.12, gain: 0.12, delay: 0.05 });
  },

  allin: (c) => {
    [330, 415, 520, 660].forEach((f, i) =>
      tone(c, { freq: f, type: 'sawtooth', dur: 0.32 - i * 0.04, gain: 0.18, delay: i * 0.05 }),
    );
    noise(c, { dur: 0.25, band: 4000, q: 0.5, gain: 0.1, delay: 0.05 });
  },

  yourTurn: (c) => {
    // gentle "your move" prompt — soft ascending two-note
    tone(c, { freq: 587.33, type: 'sine', dur: 0.12, gain: 0.26 });
    tone(c, { freq: 880, type: 'sine', dur: 0.16, gain: 0.22, delay: 0.1 });
  },

  win: (c, o) => {
    // major arpeggio C5–E5–G5–C6, transposed up by o.semitones for bigger pots
    const k = Math.pow(2, (o?.semitones ?? 0) / 12); // equal-temperament transpose
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(c, { freq: f * k, type: 'triangle', dur: 0.4 - i * 0.04, gain: 0.34, delay: i * 0.08 }),
    );
  },

  lose: (c) => {
    [392, 329.63, 261.63].forEach((f, i) =>
      tone(c, { freq: f, type: 'sine', dur: 0.3, gain: 0.26, delay: i * 0.1 }),
    );
  },

  levelUp: (c) => {
    [523.25, 698.46, 880, 1174.66].forEach((f, i) =>
      tone(c, { freq: f, type: 'triangle', dur: 0.28, gain: 0.3, delay: i * 0.06 }),
    );
  },

  star: (c) => {
    tone(c, { freq: 1320, type: 'sine', dur: 0.18, gain: 0.3 });
    tone(c, { freq: 1980, type: 'sine', dur: 0.16, gain: 0.12, delay: 0.02 });
  },

  lock: (c) => {
    tone(c, { freq: 140, to: 90, type: 'square', dur: 0.12, gain: 0.3 });
    noise(c, { dur: 0.05, band: 2400, q: 3, gain: 0.16, delay: 0.04 });
  },
};

// ---- public API -------------------------------------------------------------

export function playSfx(name: SfxName, opts?: VoiceOpts): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.ctx.state === 'suspended') void c.ctx.resume();
  try {
    VOICES[name](c, opts);
  } catch (e) {
    // Never let SFX break the UI, but don't swallow the cause — a voice that
    // throws is a real bug worth surfacing (rare: only on a killed node graph).
    console.warn('[sfx] playback failed:', name, e);
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* private mode / storage disabled — keep the in-memory value */
  }
  if (!next) playSfx('click'); // confirm un-mute audibly
  listeners.forEach((fn) => fn(next));
}

export function toggleMuted(): void {
  setMuted(!muted);
}

/** Subscribe to mute changes; returns an unsubscribe fn. */
export function subscribeMuted(fn: (m: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
