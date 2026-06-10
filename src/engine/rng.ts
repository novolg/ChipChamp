// Seeded, deterministic PRNG (mulberry32). All engine randomness flows through
// this so games are reproducible and scripted tutorial hands are stable.
// NEVER use Math.random() in non-UI modules.

/** Advance the 32-bit state and return [nextState, float in [0, 1)]. */
export function nextRandom(state: number): [number, number] {
  let a = state | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const float = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [a, float];
}

/** Return [nextState, integer in [0, maxExclusive)]. */
export function nextInt(state: number, maxExclusive: number): [number, number] {
  const [s, f] = nextRandom(state);
  return [s, Math.floor(f * maxExclusive)];
}

/** Derive a 32-bit seed from an arbitrary number or string (e.g. hand number). */
export function seedFrom(input: number | string): number {
  if (typeof input === 'number') return (input * 0x9e3779b1) | 0;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
