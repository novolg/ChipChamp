import { describe, expect, it } from 'vitest';

import { CUES } from '../cues';
import { SYNTH_NAMES } from '../synth';
import manifestJson from '../../../public/audio/manifest.json';

// The JSON import's inferred type is a literal-keyed object (one property
// per current manifest entry); widen it since we index by an arbitrary
// CUES key at runtime.
const manifest = manifestJson as { files: Record<string, string[]> };

const EXISTING_SFX_NAMES = [
  'click',
  'chipClink',
  'cardDeal',
  'bet',
  'check',
  'call',
  'fold',
  'raise',
  'allin',
  'yourTurn',
  'win',
  'lose',
  'levelUp',
  'star',
  'lock',
  'incorrect',
  'chipTick',
];

const NEW_CUE_NAMES = [
  'shuffle',
  'dealWhoosh',
  'cardSlide',
  'cardFlip',
  'cardThump',
  'chipStackS',
  'chipStackM',
  'chipStackL',
  'chipSplash',
  'potPour',
  'feltThud',
  'buttonClack',
];

describe('CUES coverage', () => {
  it('contains all 17 existing SfxNames, synth-only (no pool)', () => {
    for (const name of EXISTING_SFX_NAMES) {
      expect(CUES[name], `missing CUES entry for "${name}"`).toBeDefined();
      expect(CUES[name].pool, `expected "${name}" to stay synth-only`).toBeUndefined();
      expect(CUES[name].synth).toBe(name);
    }
  });

  it('contains all 12 new physical-foley cue names, each with a non-empty pool', () => {
    for (const name of NEW_CUE_NAMES) {
      expect(CUES[name], `missing CUES entry for "${name}"`).toBeDefined();
      expect(CUES[name].pool?.length ?? 0, `expected "${name}" to have a pool`).toBeGreaterThan(0);
    }
  });

  it('has exactly the 17 existing + 12 new cue names — nothing more, nothing less', () => {
    expect(Object.keys(CUES).sort()).toEqual([...EXISTING_SFX_NAMES, ...NEW_CUE_NAMES].sort());
  });
});

describe('CUES / manifest.json integrity', () => {
  it("every CUES[*].pool entry exists in manifest.json's files map for that cue", () => {
    for (const [name, cue] of Object.entries(CUES)) {
      if (!cue.pool) continue;
      const files = manifest.files[name];
      expect(files, `manifest.json is missing a "files" entry for cue "${name}"`).toBeDefined();
      for (const basename of cue.pool) {
        expect(files, `"${name}" pool references "${basename}", missing from manifest.json`).toContain(
          basename,
        );
      }
    }
  });

  it('every CUES[*].synth is a real SynthName (checked against synth.ts VOICES keys)', () => {
    const validNames = new Set(SYNTH_NAMES);
    for (const [name, cue] of Object.entries(CUES)) {
      expect(validNames.has(cue.synth), `cue "${name}" references unknown synth "${cue.synth}"`).toBe(
        true,
      );
    }
  });
});
