import { afterEach, describe, expect, it, vi } from 'vitest';

import { CUES } from '../cues';

// Real pool basenames for the 'shuffle' cue — sourced from cues.ts itself
// (not re-typed here) so these fixtures can't silently drift from what
// playCue actually looks up.
const SHUFFLE_POOL = CUES.shuffle.pool!;

/* Minimal fake Web Audio graph — a trimmed, independent copy of
 * engine.test.ts's harness (that file doesn't export its fakes), extended
 * with the AudioBufferSourceNode the buffer-playback path needs. */

class FakeNode {
  readonly connections: FakeNode[] = [];
  connect(dest: FakeNode): FakeNode {
    this.connections.push(dest);
    return dest;
  }
}

class FakeParam {
  value = 0;
}

class FakeGainNode extends FakeNode {
  gain = new FakeParam();
}

class FakeDynamicsCompressorNode extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

class FakeStereoPannerNode extends FakeNode {
  pan = new FakeParam();
}

class FakeBufferSourceNode extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  destination = new FakeNode();
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  bufferSources: FakeBufferSourceNode[] = [];
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    return new FakeDynamicsCompressorNode();
  }
  createStereoPanner(): FakeStereoPannerNode {
    return new FakeStereoPannerNode();
  }
  createBufferSource(): FakeBufferSourceNode {
    const src = new FakeBufferSourceNode();
    this.bufferSources.push(src);
    return src;
  }
}

function installFakeWindow(): void {
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: FakeAudioContext,
    addEventListener: vi.fn(),
  };
}

function uninstallFakeWindow(): void {
  delete (globalThis as unknown as { window?: unknown }).window;
}

/** Reset module-level singleton state (ctx, bank status/buffers, mute) and
 *  reimport fresh copies of every audio module against a fresh fake
 *  AudioContext — same convention as engine.test.ts's freshAudio(). */
async function freshAudio() {
  vi.resetModules();
  installFakeWindow();
  const engine = await import('../engine');
  const synth = await import('../synth');
  const samples = await import('../samples');
  const audio = await import('../index');
  return { engine, synth, samples, audio };
}

function fakeResponse(body: unknown, opts: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response;
}

/** Test fetchFn stubs are always called by our own code with a plain string
 *  URL (never a Request/URL object) — String(input) recovers it without
 *  fighting `typeof fetch`'s wider RequestInfo|URL parameter type. */
function urlOf(input: RequestInfo | URL): string {
  return String(input);
}

function manifestFetch(files: Record<string, string[]>) {
  return vi.fn(async (input: RequestInfo | URL) =>
    urlOf(input).endsWith('manifest.json') ? fakeResponse({ files }) : fakeResponse(null),
  );
}

afterEach(() => {
  uninstallFakeWindow();
  vi.restoreAllMocks();
});

describe('pickVariation', () => {
  it('round-robins over the pool: calls 1..5 over a 3-pool -> indices 0,1,2,0,1', async () => {
    const { samples } = await freshAudio();
    const pool = ['a', 'b', 'c'];
    const counters = new Map<string, number>();
    const picks = Array.from({ length: 5 }, () => samples.pickVariation(pool, counters));
    expect(picks).toEqual(['a', 'b', 'c', 'a', 'b']);
  });

  it('tracks independent pools independently in the same counters map', async () => {
    const { samples } = await freshAudio();
    const counters = new Map<string, number>();
    const poolA = ['x', 'y'];
    const poolB = ['p', 'q', 'r'];
    expect(samples.pickVariation(poolA, counters)).toBe('x');
    expect(samples.pickVariation(poolB, counters)).toBe('p');
    expect(samples.pickVariation(poolA, counters)).toBe('y');
    expect(samples.pickVariation(poolB, counters)).toBe('q');
  });
});

describe('loadSampleBank', () => {
  it('marks the bank failed and warns exactly once when the manifest fetch rejects', async () => {
    const { samples } = await freshAudio();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await samples.loadSampleBank(fetchFn);

    expect(samples.bankStatus()).toBe('failed');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('playCue falls through to the synth voice once the bank has failed', async () => {
    const { engine, synth, samples, audio } = await freshAudio();
    engine.ensureCtx();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const playSynthSpy = vi.spyOn(synth, 'playSynth');
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await samples.loadSampleBank(fetchFn);
    expect(samples.bankStatus()).toBe('failed');

    audio.playCue('shuffle');
    // 'shuffle' has no dedicated synth voice — cues.ts's fallback is 'cardDeal'.
    expect(playSynthSpy).toHaveBeenCalledWith('cardDeal', undefined);
  });

  it('reaches ready when fetch + decode resolve', async () => {
    const { samples } = await freshAudio();
    const fetchFn = manifestFetch({ shuffle: ['shuffle-1.mp3'] });
    const decode = vi.fn().mockResolvedValue({} as AudioBuffer);

    await samples.loadSampleBank(fetchFn, decode);

    expect(samples.bankStatus()).toBe('ready');
    expect(samples.getBuffer('shuffle-1.mp3')).not.toBeNull();
  });

  it('is idempotent: a second call does not refetch', async () => {
    const { samples } = await freshAudio();
    const fetchFn = manifestFetch({ shuffle: ['shuffle-1.mp3'] });
    const decode = vi.fn().mockResolvedValue({} as AudioBuffer);

    await samples.loadSampleBank(fetchFn, decode);
    const callsAfterFirst = fetchFn.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await samples.loadSampleBank(fetchFn, decode);

    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst);
  });

  it('is idempotent after a failure too — a second call never retries', async () => {
    const { samples } = await freshAudio();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await samples.loadSampleBank(fetchFn);
    const callsAfterFirst = fetchFn.mock.calls.length;

    await samples.loadSampleBank(fetchFn);

    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst);
    expect(samples.bankStatus()).toBe('failed');
  });
});

describe('playCue sample playback', () => {
  it('plays a decoded buffer with jittered playbackRate on the cue bus once ready', async () => {
    const { samples, audio, engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const fetchFn = manifestFetch({ shuffle: SHUFFLE_POOL });
    const decode = vi.fn().mockResolvedValue({} as AudioBuffer);
    await samples.loadSampleBank(fetchFn, decode);

    const fakeCtx = api.ctx as unknown as FakeAudioContext;
    audio.playCue('shuffle');

    expect(fakeCtx.bufferSources).toHaveLength(1);
    const src = fakeCtx.bufferSources[0];
    expect(src.start).toHaveBeenCalled();
    expect(src.playbackRate.value).toBeGreaterThanOrEqual(0.96);
    expect(src.playbackRate.value).toBeLessThanOrEqual(1.04);
    expect(src.connections).toEqual([api.bus('sfx')]);
  });

  it('inserts a StereoPannerNode ahead of the bus when opts.pan is given', async () => {
    const { samples, audio, engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const fetchFn = manifestFetch({ shuffle: SHUFFLE_POOL });
    const decode = vi.fn().mockResolvedValue({} as AudioBuffer);
    await samples.loadSampleBank(fetchFn, decode);

    const fakeCtx = api.ctx as unknown as FakeAudioContext;
    audio.playCue('shuffle', { pan: -0.5 });

    const src = fakeCtx.bufferSources[0];
    expect(src.connections).toHaveLength(1);
    const panner = src.connections[0] as unknown as FakeStereoPannerNode;
    expect(panner.pan.value).toBe(-0.5);
    expect(panner.connections).toEqual([api.bus('sfx')]);
  });

  it("round-robins through the cue's pool across successive plays", async () => {
    const { samples, audio, engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const fetchFn = manifestFetch({ shuffle: SHUFFLE_POOL });
    const decode = vi.fn(async (ab: ArrayBuffer) => ({ ab, tag: Math.random() }) as unknown as AudioBuffer);
    await samples.loadSampleBank(fetchFn, decode);

    const fakeCtx = api.ctx as unknown as FakeAudioContext;
    audio.playCue('shuffle');
    audio.playCue('shuffle');
    audio.playCue('shuffle');

    expect(fakeCtx.bufferSources).toHaveLength(3);
    expect(fakeCtx.bufferSources[0].buffer).toBe(samples.getBuffer(SHUFFLE_POOL[0]));
    expect(fakeCtx.bufferSources[1].buffer).toBe(samples.getBuffer(SHUFFLE_POOL[1]));
    expect(fakeCtx.bufferSources[2].buffer).toBe(samples.getBuffer(SHUFFLE_POOL[0]));
  });

  it('short-circuits (no graph activity) while muted, same as the synth path', async () => {
    const { samples, audio, engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const fetchFn = manifestFetch({ shuffle: SHUFFLE_POOL });
    const decode = vi.fn().mockResolvedValue({} as AudioBuffer);
    await samples.loadSampleBank(fetchFn, decode);

    audio.setMuted(true);
    const fakeCtx = api.ctx as unknown as FakeAudioContext;
    audio.playCue('shuffle');

    expect(fakeCtx.bufferSources).toHaveLength(0);
  });
});
