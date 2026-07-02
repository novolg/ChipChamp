/* Public audio API: bus engine + synth voices, combined.
 *
 * `playCue` is the stable entry point consumers should call by cue name.
 * Today it's a straight passthrough to the synth engine; Task 5 adds a
 * sample-bank lookup ahead of the synth fallback without changing this
 * signature. */

import {
  ensureCtx,
  setBusVolume,
  getBusVolume,
  isMuted,
  setMuted as setMutedRaw,
  subscribeMuted,
} from './engine';
import { playSynth, type SynthName } from './synth';

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

/** Play a cue by name. Task 5 wires a sample-bank lookup here; until then
 *  this is a passthrough to the synth voice of the same name. */
export function playCue(name: string, opts?: { pan?: number; semitones?: number }): void {
  playSynth(name as SynthName, opts);
}
