/* Bus graph engine.
 *
 * Every voice/sample flows: source → (optional pan) → bus gain → master gain →
 * limiter → destination. Four persistent buses (music/ambience/sfx/ui) let
 * synth voices and, later, sample playback (Task 5) share one graph while
 * being balanced independently. The context is created lazily and resumed on
 * the first user gesture (browser autoplay policy). Mute state persists in
 * localStorage and is independent of prefers-reduced-motion — visual motion
 * and sound are governed separately. */

export type BusName = 'music' | 'ambience' | 'sfx' | 'ui';

const STORAGE_KEY = 'cc.muted';
const MASTER_GAIN = 0.22; // keep cues subtle — this is a learning app, not a casino

const BUS_DEFAULTS: Record<BusName, number> = {
  sfx: 1,
  ui: 1,
  ambience: 0.8,
  music: 0.8,
};

const BUS_NAMES: BusName[] = ['music', 'ambience', 'sfx', 'ui'];

let ctx: AudioContext | null = null;
let masterNode: GainNode | null = null;
const busNodes = new Map<BusName, GainNode>();
const busVolumes: Record<BusName, number> = { ...BUS_DEFAULTS };
// User-facing scalar in [0,1] (1 = "100%" in the settings UI) applied ON TOP
// OF the calibrated MASTER_GAIN trim — never written raw into the GainNode.
// Default 1 reproduces today's tuned output (masterGain() === MASTER_GAIN).
let masterVolume = 1;

/** The actual GainNode value for the current masterVolume setting. */
function masterGain(): number {
  return MASTER_GAIN * masterVolume;
}

let muted = readMuted();
const listeners = new Set<(m: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Share of the sfx bus sent to the room reverb (table sounds only; UI ticks stay dry). */
const REVERB_SEND = 0.16;
/** Room size: impulse length (s) and how fast it dies away. */
const ROOM_SECONDS = 1.3;
const ROOM_DECAY = 3.2;

/** Synthetic "small wooden saloon" impulse: stereo noise with an exponential
 *  tail, softened over time (each sample averaged with the last) so the tail
 *  darkens like a real room instead of hissing. */
function roomImpulse(c: BaseAudioContext): AudioBuffer {
  const frames = Math.floor(c.sampleRate * ROOM_SECONDS);
  const buf = c.createBuffer(2, frames, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let prev = 0;
    for (let i = 0; i < frames; i++) {
      const t = i / frames;
      const smooth = Math.min(0.9, t * 1.4); // more low-pass as the tail goes on
      const v = (Math.random() * 2 - 1) * Math.pow(1 - t, ROOM_DECAY);
      prev = prev * smooth + v * (1 - smooth);
      data[i] = prev;
    }
  }
  return buf;
}

function buildGraph(c: AudioContext): void {
  masterNode = c.createGain();
  masterNode.gain.value = masterGain();
  // Clarity EQ: cut sub rumble the small speakers can't play (it only eats
  // headroom), and lift the "air" band a little so clicks and bells read.
  const rumbleCut = c.createBiquadFilter();
  rumbleCut.type = 'highpass';
  rumbleCut.frequency.value = 38;
  rumbleCut.Q.value = 0.7;
  const air = c.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 6500;
  air.gain.value = 2.5;
  // Gentle brick-wall limiter: protects the busiest cues (all-in into a win,
  // ~11 stacked voices) from clipping. Threshold sits above any single cue's
  // peak, so a lone click and the win arpeggio are unchanged — only stacked
  // voices duck. ~zero CPU; the standard pro fix.
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  masterNode.connect(rumbleCut).connect(air).connect(limiter).connect(c.destination);

  // Room reverb, fed only from the sfx bus (send → convolver → master).
  const reverbSend = c.createGain();
  reverbSend.gain.value = REVERB_SEND;
  const room = c.createConvolver();
  room.buffer = roomImpulse(c);
  reverbSend.connect(room).connect(masterNode);

  busNodes.clear();
  for (const name of BUS_NAMES) {
    const g = c.createGain();
    g.gain.value = busVolumes[name];
    g.connect(masterNode);
    if (name === 'sfx') g.connect(reverbSend);
    busNodes.set(name, g);
  }
}

/** Create (once) and return the context + a bus lookup, or null if unsupported. */
export function ensureCtx(): { ctx: AudioContext; bus: (name: BusName) => GainNode } | null {
  if (ctx && masterNode) {
    return { ctx, bus: (name) => busNodes.get(name) as GainNode };
  }
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  buildGraph(ctx);
  return { ctx, bus: (name) => busNodes.get(name) as GainNode };
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

export function setBusVolume(name: BusName | 'master', v: number): void {
  const clamped = clamp01(v);
  if (name === 'master') {
    masterVolume = clamped;
    if (masterNode) masterNode.gain.value = masterGain();
    return;
  }
  busVolumes[name] = clamped;
  const node = busNodes.get(name);
  if (node) node.gain.value = clamped;
}

export function getBusVolume(name: BusName | 'master'): number {
  return name === 'master' ? masterVolume : busVolumes[name];
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
