import { describe, it, expect } from 'vitest';
import { lampRest, breatheAlpha, LAMP_ALPHA_MIN, LAMP_ALPHA_MAX } from '../LampActor';
import { tableLayout } from '../../layout';

describe('lampRest', () => {
  it('sits horizontally centered and above the felt center', () => {
    const L = tableLayout('landscape');
    const rest = lampRest(L);
    expect(rest.x).toBe(L.felt.cx);
    expect(rest.y).toBeLessThan(L.felt.cy); // "from above"
  });
});

describe('breatheAlpha', () => {
  it('stays within the breathing band for any elapsed time', () => {
    for (const t of [0, 1000, 4000, 8000, 15234]) {
      const a = breatheAlpha(t);
      expect(a).toBeGreaterThanOrEqual(LAMP_ALPHA_MIN - 1e-9);
      expect(a).toBeLessThanOrEqual(LAMP_ALPHA_MAX + 1e-9);
    }
  });
});
