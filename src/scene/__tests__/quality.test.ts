import { describe, expect, it } from 'vitest';
import { resolveTier, defaultProbe, type WebGLProbeResult } from '../quality';

const probe = (r: WebGLProbeResult) => () => r;

describe('resolveTier', () => {
  it('passes forced settings straight through, ignoring the probe', () => {
    // A probe that would say "full" must not override an explicit lower setting.
    expect(resolveTier('dom', probe('webgl2'))).toBe('dom');
    expect(resolveTier('full', probe(null))).toBe('full');
    expect(resolveTier('reduced', probe('webgl2'))).toBe('reduced');
  });

  it('auto → full when WebGL2 is available', () => {
    expect(resolveTier('auto', probe('webgl2'))).toBe('full');
  });

  it('auto → reduced when only WebGL1 is available', () => {
    expect(resolveTier('auto', probe('webgl1'))).toBe('reduced');
  });

  it('auto → dom when no WebGL context is available', () => {
    expect(resolveTier('auto', probe(null))).toBe('dom');
  });

  it('uses defaultProbe when none is injected (auto path does not throw)', () => {
    // In the node/jsdom-less vitest env there is no document → defaultProbe
    // returns null → auto resolves to dom. The call must be side-effect free.
    expect(resolveTier('auto')).toBe('dom');
  });
});

describe('defaultProbe', () => {
  it('returns null when the DOM is unavailable (SSR / node test env)', () => {
    expect(defaultProbe()).toBeNull();
  });
});
