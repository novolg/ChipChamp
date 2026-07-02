import { describe, expect, it, vi } from 'vitest';
import { createDirector, type Channels, type DirectorOpts } from '../director';

// Guard for the "injected scheduler never loads gsap" invariant: this factory
// only runs if something actually imports the gsap module. Every test in this
// file injects a scheduler, so the flag must stay false (asserted at the end).
const gsapProbe = vi.hoisted(() => ({ loaded: false }));
vi.mock('gsap', () => {
  gsapProbe.loaded = true;
  return { gsap: { delayedCall: () => ({ kill: () => {} }) } };
});
import type { ChannelName } from '../recipes';
import type { Intensity } from '../intensity';
import type { FeelEvent } from '../events';
import { Street } from '../../engine/types';
import type { GameState, Seat } from '../../engine/types';

function seat(id: number, name: string, isHuman: boolean, overrides: Partial<Seat> = {}): Seat {
  return {
    id,
    name,
    isHuman,
    stack: 1000,
    holeCards: [],
    committedThisStreet: 0,
    committedTotal: 0,
    status: 'active',
    hasActedThisStreet: false,
    ...overrides,
  };
}

function gs(partial: Partial<GameState> = {}): GameState {
  return {
    seats: [seat(0, 'You', true), seat(1, 'Ava', false), seat(2, 'Ben', false), seat(3, 'Cleo', false)],
    buttonSeatId: 0,
    smallBlind: 10,
    bigBlind: 20,
    street: Street.Preflop,
    board: [],
    deck: [],
    pots: [],
    toActSeatId: null,
    currentBet: 0,
    minRaise: 20,
    lastAggressorSeatId: null,
    lastFullRaiseLevel: 0,
    rngState: 0,
    handNumber: 1,
    log: [],
    phase: 'betting',
    ...partial,
  };
}

interface Call {
  cue: string;
  params: Record<string, unknown>;
  i: Intensity;
}

function fakeChannels() {
  const calls: Record<ChannelName, Call[]> = { scene: [], audio: [], dom: [], haptic: [] };
  const ch: Channels = {
    scene: (cue, params, i) => calls.scene.push({ cue, params, i }),
    audio: (cue, params, i) => calls.audio.push({ cue, params, i }),
    dom: (cue, params, i) => calls.dom.push({ cue, params, i }),
    haptic: (cue, params, i) => calls.haptic.push({ cue, params, i }),
  };
  return { ch, calls };
}

/** Fires synchronously and returns a no-op cancel — good enough for tests
 *  that only care about which cues eventually landed, not timing. */
const immediate = (fn: () => void): (() => void) => {
  fn();
  return () => {};
};

/** Records every schedule() call instead of firing it, with a spy cancel fn —
 *  for tests that assert on offsets or on cancellation. */
function recordingScheduler() {
  const scheduled: { ms: number; fn: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const schedule = (fn: () => void, ms: number): (() => void) => {
    const cancel = vi.fn();
    scheduled.push({ ms, fn, cancel });
    return cancel;
  };
  return { schedule, scheduled };
}

function baseOpts(overrides: Partial<DirectorOpts> = {}): DirectorOpts {
  return {
    speed: () => 1,
    reducedMotion: () => false,
    tier: () => 'full',
    schedule: immediate,
    ...overrides,
  };
}

const winEvent = (heroWon: boolean, amount: number): FeelEvent => ({
  type: 'WIN',
  heroWon,
  amount,
  winnerSlot: heroWon ? 'hero' : 'left',
});

describe('createDirector', () => {
  it('WIN monster event -> confetti count 56, win semitones 4', () => {
    const { ch, calls } = fakeChannels();
    const director = createDirector(ch, baseOpts());
    director.dispatch([winEvent(true, 1000)], gs({ bigBlind: 20 })); // 1000/20 = 50 -> monster

    const confetti = calls.scene.find((c) => c.cue === 'confetti');
    const win = calls.audio.find((c) => c.cue === 'win');
    expect(confetti?.params).toMatchObject({ count: 56 });
    expect(win?.params).toMatchObject({ semitones: 4 });
  });

  it('reduced motion drops all scene steps (e.g. confetti) but keeps audio (e.g. win)', () => {
    const { ch, calls } = fakeChannels();
    const director = createDirector(ch, baseOpts({ reducedMotion: () => true }));
    director.dispatch([winEvent(true, 1000)], gs({ bigBlind: 20 }));

    expect(calls.scene).toHaveLength(0);
    expect(calls.audio.find((c) => c.cue === 'win')).toBeDefined();
  });

  it('tier "dom" skips steps gated minTier "reduced" (confetti)', () => {
    const { ch, calls } = fakeChannels();
    const director = createDirector(ch, baseOpts({ tier: () => 'dom' }));
    director.dispatch([winEvent(true, 40)], gs());

    expect(calls.scene.find((c) => c.cue === 'confetti')).toBeUndefined();
    expect(calls.audio.find((c) => c.cue === 'win')).toBeDefined();
  });

  it.each(['reduced', 'full'] as const)(
    'tier %s does NOT skip minTier "reduced" steps (confetti still fires)',
    (tierValue) => {
      const { ch, calls } = fakeChannels();
      const director = createDirector(ch, baseOpts({ tier: () => tierValue }));
      director.dispatch([winEvent(true, 40)], gs());

      expect(calls.scene.find((c) => c.cue === 'confetti')).toBeDefined();
    },
  );

  it('speed 2 halves every scheduled offset', () => {
    const { ch } = fakeChannels();
    const { schedule, scheduled } = recordingScheduler();
    const director = createDirector(ch, baseOpts({ speed: () => 2, schedule }));
    director.dispatch([{ type: 'HAND_START', handNumber: 1 }], gs());

    // HAND_START 1x offsets: 0 (scene), 0, 450, 600, 980 (audio) -> /2
    expect(scheduled.map((s) => s.ms).sort((a, b) => a - b)).toEqual([0, 0, 225, 300, 490]);
  });

  it('speed 0.5 doubles every scheduled offset', () => {
    const { ch } = fakeChannels();
    const { schedule, scheduled } = recordingScheduler();
    const director = createDirector(ch, baseOpts({ speed: () => 0.5, schedule }));
    director.dispatch([{ type: 'HAND_START', handNumber: 1 }], gs());

    // HAND_START 1x offsets: 0 (scene), 0, 450, 600, 980 (audio) -> x2
    expect(scheduled.map((s) => s.ms).sort((a, b) => a - b)).toEqual([0, 0, 900, 1200, 1960]);
  });

  it('cancelAll cancels every pending scheduled step', () => {
    const { ch } = fakeChannels();
    const { schedule, scheduled } = recordingScheduler();
    const director = createDirector(ch, baseOpts({ schedule }));
    director.dispatch([{ type: 'HAND_START', handNumber: 1 }], gs());

    expect(scheduled.length).toBeGreaterThan(0);
    director.cancelAll();
    for (const s of scheduled) expect(s.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancelAll on an empty pending list is a no-op', () => {
    const { ch } = fakeChannels();
    const director = createDirector(ch, baseOpts());
    expect(() => director.cancelAll()).not.toThrow();
  });

  it('dispatching a HAND_START event auto-cancels previously pending steps', () => {
    const { ch } = fakeChannels();
    const { schedule, scheduled } = recordingScheduler();
    const director = createDirector(ch, baseOpts({ schedule }));

    director.dispatch([{ type: 'TURN_START' }], gs());
    const firstBatch = [...scheduled];
    expect(firstBatch.length).toBeGreaterThan(0);

    director.dispatch([{ type: 'HAND_START', handNumber: 2 }], gs({ handNumber: 2 }));
    for (const s of firstBatch) expect(s.cancel).toHaveBeenCalledTimes(1);
  });

  // Chip-stack cue scales with bet size via intensity VALUE (ACTION's tier is
  // constant 'small' by design; value = max(0.2, min(1, amountBB/25))).
  it('ACTION raise with amountBB 30 (intensity value 1) schedules chipStackL', () => {
    const { ch, calls } = fakeChannels();
    const director = createDirector(ch, baseOpts());
    director.dispatch(
      [{ type: 'ACTION', action: 'raise', seatId: 1, slot: 'left', amountBB: 30 }],
      gs(),
    );

    expect(calls.audio.map((c) => c.cue)).toContain('chipStackL');
    expect(calls.audio.map((c) => c.cue)).not.toContain('chipStackS');
  });

  it('ACTION bet with amountBB 2 (intensity value 0.2 floor) schedules chipStackS', () => {
    const { ch, calls } = fakeChannels();
    const director = createDirector(ch, baseOpts());
    director.dispatch(
      [{ type: 'ACTION', action: 'bet', seatId: 1, slot: 'left', amountBB: 2 }],
      gs(),
    );

    expect(calls.audio.map((c) => c.cue)).toContain('chipStackS');
    expect(calls.audio.map((c) => c.cue)).not.toContain('chipStackL');
  });

  it("passes the event's computed Intensity through to channel calls", () => {
    const { ch, calls } = fakeChannels();
    const director = createDirector(ch, baseOpts());
    director.dispatch(
      [{ type: 'ACTION', action: 'fold', seatId: 1, slot: 'left', amountBB: 0 }],
      gs(),
    );

    expect(calls.audio[0]?.i).toEqual({ value: 0.15, tier: 'small' });
  });

  it('a step that fires via an immediate scheduler removes itself from pending (no leak)', () => {
    const { ch } = fakeChannels();
    const director = createDirector(ch, baseOpts()); // immediate scheduler
    director.dispatch([{ type: 'TURN_START' }], gs());
    // Nothing left pending to cancel — cancelAll should be a safe no-op.
    expect(() => director.cancelAll()).not.toThrow();
  });

  // Keep this test LAST: it asserts that none of the tests above (all of
  // which inject a scheduler) caused the gsap module to load. If a future
  // test accidentally exercises the default scheduler, this fails loudly.
  it('never loads gsap when a scheduler is injected', () => {
    expect(gsapProbe.loaded).toBe(false);
  });
});
