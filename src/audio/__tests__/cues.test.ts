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

// The two existing SfxNames that get sample pools (physical felt sounds named
// in the Phase-1 sample set); the other 15 existing names stay synth-only.
const POOLED_EXISTING = ['chipClink', 'cardDeal'];

describe('CUES coverage', () => {
  it('contains all 17 existing SfxNames, each with synth === its own name', () => {
    for (const name of EXISTING_SFX_NAMES) {
      expect(CUES[name], `missing CUES entry for "${name}"`).toBeDefined();
      expect(CUES[name].synth).toBe(name);
    }
  });

  it('pools exactly chipClink + cardDeal among the existing names; the other 15 stay synth-only', () => {
    for (const name of EXISTING_SFX_NAMES) {
      if (POOLED_EXISTING.includes(name)) {
        expect(CUES[name].pool?.length ?? 0, `expected "${name}" to have a pool`).toBeGreaterThan(0);
      } else {
        expect(CUES[name].pool, `expected "${name}" to stay synth-only`).toBeUndefined();
      }
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

  it('every manifest.json files key is referenced by a CUES pool of the same name (no orphan sourcing targets for Task 14)', () => {
    for (const [key, files] of Object.entries(manifest.files)) {
      const cue = CUES[key];
      expect(cue?.pool, `manifest.json entry "${key}" has no CUES pool consuming it`).toBeDefined();
      // Both directions of file-level consistency: the pool must reference
      // every listed file, and (via the forward test above) nothing more.
      expect(cue.pool!.slice().sort()).toEqual(files.slice().sort());
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
