/* Public audio API: bus engine + synth voices + sample bank, combined.
 *
 * `playCue` is the stable entry point consumers should call by cue name:
 * sample-first (when the cue has a pool and the bank finished loading), with
 * a permanent synth-voice fallback otherwise (no samples ship yet — Task 14
 * curates them; the app must stay fully, silently playable without them). */

import {
  ensureCtx,
  setBusVolume,
  getBusVolume,
  isMuted,
  setMuted as setMutedRaw,
  subscribeMuted,
  type BusName,
} from './engine';
import { playSynth, type SynthName } from './synth';
import { CUES } from './cues';
import { loadSampleBank, bankStatus, pickVariation, getBuffer } from './samples';

export { ensureCtx, setBusVolume, getBusVolume, isMuted, subscribeMuted, playSynth };
export type { BusName } from './engine';
export type { SynthName, VoiceOpts } from './synth';

/** Mute, preserving the original "confirm un-mute audibly" click. */
export function setMuted(next: boolean): void {
  setMutedRaw(next);
  if (!next) playSynth('click');
}

export function toggleMuted(): void {
  setMuted(!isMuted());
}

// Round-robin state for sample-pool variation, one counter per distinct
// pool (see samples.ts's pickVariation). Lives here, not in samples.ts —
// it's playback-path state, not sample-bank state.
const variationCounters = new Map<string, number>();

/** Kick off sample loading on the first user gesture — same 3 event types as
 *  engine.ts's own unlock listeners, so the bank starts fetching the moment
 *  audio is unlocked. `loadSampleBank` is idempotent, so extra gestures
 *  before the first load settles are free no-ops. */
if (typeof window !== 'undefined') {
  const onGesture = () => void loadSampleBank();
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture, { passive: true });
  window.addEventListener('touchstart', onGesture, { passive: true });
}

/** Play a decoded sample buffer through the cue's bus. Returns false when
 *  there's no context to play through OR the node graph throws (same "never
 *  let SFX break the UI" rule as playSynth) — either way the caller falls
 *  back to the synth voice, so a bad buffer degrades to sound, not silence. */
function playBuffer(name: string, bus: BusName, buffer: AudioBuffer, opts?: { pan?: number }): boolean {
  const c = ensureCtx();
  if (!c) return false;
  try {
    if (c.ctx.state === 'suspended') void c.ctx.resume();
    const src = c.ctx.createBufferSource();
    src.buffer = buffer;
    // ±4% pitch/speed jitter so repeated cues (chip clinks, card slides)
    // don't sound like the exact same recording on every hit.
    src.playbackRate.value = 1 + (Math.random() * 0.08 - 0.04);
    const busNode = c.bus(bus);
    let dest: AudioNode = busNode;
    if (opts?.pan !== undefined) {
      const panner = c.ctx.createStereoPanner();
      panner.pan.value = opts.pan;
      panner.connect(busNode);
      dest = panner;
    }
    src.connect(dest);
    src.start();
    return true;
  } catch (e) {
    console.warn('[sfx] sample playback failed:', name, e);
    return false;
  }
}

/** Play a cue by name: a sample from its pool when the bank is ready and a
 *  buffer is available, otherwise the synth voice of its fallback recipe.
 *  Names not registered in CUES fall through to the synth engine directly
 *  (matches the pre-Task-5 passthrough behavior). */
export function playCue(name: string, opts?: { pan?: number; semitones?: number }): void {
  if (isMuted()) return;
  const cue = CUES[name];
  if (cue?.pool && bankStatus() === 'ready') {
    const basename = pickVariation(cue.pool, variationCounters);
    const buffer = getBuffer(basename);
    if (buffer && playBuffer(name, cue.bus, buffer, opts)) return;
  }
  playSynth((cue?.synth ?? name) as SynthName, opts);
}
