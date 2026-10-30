import { afterEach, describe, expect, it, vi } from 'vitest';

/* Minimal fake Web Audio graph: gain/compressor/panner/oscillator/etc. nodes
 * that record their .connect() targets (so wiring order is assertable) and
 * are collected on the context (so voice recipes are assertable), plus the
 * handful of properties/methods the engine and synth voices touch. */

let nodeSeq = 0;

class FakeNode {
  readonly id: string;
  readonly connections: FakeNode[] = [];
  constructor(kind: string) {
    this.id = `${kind}${nodeSeq++}`;
  }
  connect(dest: FakeNode): FakeNode {
    this.connections.push(dest);
    return dest;
  }
}

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  exponentialRampToValueAtTime = vi.fn();
}

class FakeGainNode extends FakeNode {
  gain = new FakeParam();
  constructor() {
    super('gain');
  }
}

class FakeDynamicsCompressorNode extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  constructor() {
    super('limiter');
  }
}

class FakeStereoPannerNode extends FakeNode {
  pan = new FakeParam();
  constructor() {
    super('pan');
  }
}

class FakeOscillatorNode extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    super('osc');
  }
}

class FakeBufferSourceNode extends FakeNode {
  buffer: unknown = null;
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    super('src');
  }
}

class FakeBiquadFilterNode extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
  gain = new FakeParam();
  constructor() {
    super('biquad');
  }
}

class FakeConvolverNode extends FakeNode {
  buffer: unknown = null;
  constructor() {
    super('convolver');
  }
}

class FakeAudioBuffer {
  constructor(private frames: number) {}
  getChannelData(): Float32Array {
    return new Float32Array(this.frames);
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'running' | 'suspended' = 'running';
  destination = new FakeNode('destination');
  oscillators: FakeOscillatorNode[] = [];
  gains: FakeGainNode[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createGain(): FakeGainNode {
    const g = new FakeGainNode();
    this.gains.push(g);
    return g;
  }
  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    return new FakeDynamicsCompressorNode();
  }
  createStereoPanner(): FakeStereoPannerNode {
    return new FakeStereoPannerNode();
  }
  createOscillator(): FakeOscillatorNode {
    const osc = new FakeOscillatorNode();
    this.oscillators.push(osc);
    return osc;
  }
  createBufferSource(): FakeBufferSourceNode {
    return new FakeBufferSourceNode();
  }
  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }
  createConvolver(): FakeConvolverNode {
    return new FakeConvolverNode();
  }
  createBuffer(_channels: number, frames: number): FakeAudioBuffer {
    return new FakeAudioBuffer(frames);
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

/** The engine's public types are the real DOM node types; cast back to the
 *  fakes to inspect the connect log / recorded values in tests. */
function asFake(node: GainNode): FakeGainNode {
  return node as unknown as FakeGainNode;
}

/** Reset module-level singleton state (ctx/mute/bus volumes) and reimport
 *  fresh copies of engine/synth/index against a fresh fake AudioContext. */
async function freshAudio() {
  vi.resetModules();
  nodeSeq = 0;
  installFakeWindow();
  const engine = await import('../engine');
  const synth = await import('../synth');
  const audio = await import('../index');
  return { engine, synth, audio };
}

afterEach(() => {
  uninstallFakeWindow();
  vi.restoreAllMocks();
});

describe('bus graph wiring', () => {
  it('returns null when AudioContext is unsupported (no window)', async () => {
    vi.resetModules();
    uninstallFakeWindow();
    const engine = await import('../engine');
    expect(engine.ensureCtx()).toBeNull();
  });

  it('wires bus -> master -> rumble cut -> air shelf -> limiter -> destination', async () => {
    const { engine } = await freshAudio();
    const api = engine.ensureCtx();
    expect(api).not.toBeNull();

    const sfxBus = asFake(api!.bus('sfx'));
    const master = sfxBus.connections[0] as FakeGainNode;
    expect(master.gain.value).toBeCloseTo(0.22);

    expect(master.connections).toHaveLength(1);
    const rumbleCut = master.connections[0] as unknown as FakeBiquadFilterNode;
    expect(rumbleCut.type).toBe('highpass');
    const air = rumbleCut.connections[0] as unknown as FakeBiquadFilterNode;
    expect(air.type).toBe('highshelf');
    const limiter = air.connections[0] as FakeDynamicsCompressorNode;
    expect(limiter.threshold.value).toBe(-8);
    expect(limiter.knee.value).toBe(4);
    expect(limiter.ratio.value).toBe(12);
    expect(limiter.attack.value).toBe(0.003);
    expect(limiter.release.value).toBe(0.12);

    expect(limiter.connections).toEqual([api!.ctx.destination]);
  });

  it('sends only the sfx bus to the room reverb, which returns into master', async () => {
    const { engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const sfxBus = asFake(api.bus('sfx'));
    const master = sfxBus.connections[0];
    expect(sfxBus.connections).toHaveLength(2);
    const send = sfxBus.connections[1] as FakeGainNode;
    expect(send.gain.value).toBeGreaterThan(0);
    expect(send.gain.value).toBeLessThan(0.3);
    const room = send.connections[0] as unknown as FakeConvolverNode;
    expect(room.buffer).not.toBeNull();
    expect(room.connections).toEqual([master]);
    expect(asFake(api.bus('ui')).connections).toEqual([master]);
  });

  it('applies bus defaults: sfx 1, ui 1, ambience .8, music .8', async () => {
    const { engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    expect(api.bus('sfx').gain.value).toBe(1);
    expect(api.bus('ui').gain.value).toBe(1);
    expect(api.bus('ambience').gain.value).toBe(0.8);
    expect(api.bus('music').gain.value).toBe(0.8);
  });

  it('clamps bus volumes to [0,1] and writes through to the live GainNode', async () => {
    const { engine } = await freshAudio();
    const api = engine.ensureCtx()!;

    engine.setBusVolume('music', 1.7);
    expect(engine.getBusVolume('music')).toBe(1);
    expect(api.bus('music').gain.value).toBe(1);

    engine.setBusVolume('music', -0.4);
    expect(engine.getBusVolume('music')).toBe(0);
    expect(api.bus('music').gain.value).toBe(0);

    engine.setBusVolume('music', 0.45);
    expect(engine.getBusVolume('music')).toBe(0.45);
    expect(api.bus('music').gain.value).toBe(0.45);

    // untouched buses keep their defaults
    expect(engine.getBusVolume('ambience')).toBe(0.8);
  });

  it('clamps master volume to [0,1] (raw setting) while the GainNode carries the MASTER_GAIN-scaled value', async () => {
    const { engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const master = asFake(api.bus('sfx')).connections[0] as FakeGainNode;

    engine.setBusVolume('master', 5);
    expect(engine.getBusVolume('master')).toBe(1); // setting stays a 0..1 scalar
    expect(master.gain.value).toBeCloseTo(0.22); // MASTER_GAIN * 1 — today's tuned level

    engine.setBusVolume('master', -1);
    expect(engine.getBusVolume('master')).toBe(0);
    expect(master.gain.value).toBe(0); // MASTER_GAIN * 0
  });

  it('scales master volume on top of the calibrated MASTER_GAIN trim, not raw (Finding 2)', async () => {
    const { engine } = await freshAudio();
    const api = engine.ensureCtx()!;
    const master = asFake(api.bus('sfx')).connections[0] as FakeGainNode;

    // default setting is a no-op scalar of 1 → build-time gain reproduces
    // today's tuned output exactly, not raw 1.0.
    expect(master.gain.value).toBeCloseTo(0.22);

    engine.setBusVolume('master', 0.5);
    expect(engine.getBusVolume('master')).toBe(0.5);
    expect(master.gain.value).toBeCloseTo(0.11); // MASTER_GAIN * 0.5

    engine.setBusVolume('master', 1);
    expect(master.gain.value).toBeCloseTo(0.22); // MASTER_GAIN * 1 — back to tuned level, not raw 1.0
  });

  it('applies a pre-set master volume (set before the AudioContext/graph exists) through MASTER_GAIN at build time', async () => {
    const { engine } = await freshAudio();
    // No ensureCtx() yet — setBusVolume must still update the stored scalar
    // that buildGraph reads on first ensureCtx(), regardless of call order.
    engine.setBusVolume('master', 0.5);
    expect(engine.getBusVolume('master')).toBe(0.5);

    const api = engine.ensureCtx()!;
    const master = asFake(api.bus('sfx')).connections[0] as FakeGainNode;
    expect(master.gain.value).toBeCloseTo(0.11); // MASTER_GAIN * 0.5, applied at buildGraph time
  });
});

describe('mute', () => {
  it('subscribeMuted fires with the new state on toggle', async () => {
    const { engine, audio } = await freshAudio();
    const fn = vi.fn();
    const unsub = engine.subscribeMuted(fn);
    audio.toggleMuted();
    expect(fn).toHaveBeenCalledWith(true);
    unsub();
  });

  it('short-circuits playback while muted (no graph activity)', async () => {
    const { engine, audio } = await freshAudio();
    engine.ensureCtx(); // build the graph once so node counts are stable
    audio.setMuted(true);

    const before = nodeSeq;
    audio.playCue('click');
    expect(nodeSeq).toBe(before); // no oscillator/gain created — muted, no-op

    audio.setMuted(false); // also plays the un-mute confirm click
    expect(nodeSeq).toBeGreaterThan(before);
  });

  it('un-muting plays the confirm click via the synth engine', async () => {
    const { engine, audio } = await freshAudio();
    const api = engine.ensureCtx()!;
    audio.setMuted(true);

    const before = (api.ctx as unknown as FakeAudioContext).oscillators.length;
    audio.setMuted(false);
    // the 'click' recipe has exactly one oscillator (plus a noise click)
    expect((api.ctx as unknown as FakeAudioContext).oscillators.length).toBe(before + 1);
  });
});

describe('playCue passthrough', () => {
  it("reaches the 'win' synth voice and applies the semitone transpose", async () => {
    const { engine, audio } = await freshAudio();
    const api = engine.ensureCtx()!;

    audio.playCue('win', { semitones: 2 });

    // the 'win' recipe opens on a bell at C5 (523.25Hz), transposed
    const oscillators = (api.ctx as unknown as FakeAudioContext).oscillators;
    const k = Math.pow(2, 2 / 12);
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      523.25 * k,
      expect.any(Number),
    );
  });

  it('routes ui-bus voices (click) and sfx-bus voices (win) to their own bus', async () => {
    const { engine, audio } = await freshAudio();
    const api = engine.ensureCtx()!;
    const fakeCtx = api.ctx as unknown as FakeAudioContext;
    const uiBus = api.bus('ui');
    const sfxBus = api.bus('sfx');

    // 'click' voices are wired straight into the bus its recipe targets.
    let before = fakeCtx.gains.length;
    audio.playCue('click');
    const clickGain = fakeCtx.gains[before];
    expect(clickGain.connections).toEqual([uiBus]);

    before = fakeCtx.gains.length;
    audio.playCue('win');
    const winGains = fakeCtx.gains.slice(before);
    expect(winGains.length).toBeGreaterThan(0);
    winGains.forEach((g) => expect(g.connections).toEqual([sfxBus]));
  });
});
