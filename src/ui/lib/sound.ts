/* Back-compat shim. The synth engine and bus graph moved to `src/audio`
 * (bus engine `engine.ts`, voice recipes `synth.ts`, public API `index.ts`).
 * Existing imports of `playSfx`/`SfxName`/mute controls keep working
 * unchanged through this re-export. */

export { playCue as playSfx, isMuted, setMuted, toggleMuted, subscribeMuted } from '../../audio';
export type { SynthName as SfxName } from '../../audio/synth';
export type { VoiceOpts } from '../../audio/synth';
