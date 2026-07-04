import { describe, expect, it } from 'vitest';
import { RECIPES, SCENE_FX, RITUAL_MS } from '../recipes';
import { CUES } from '../../audio/cues';
import { Street } from '../../engine/types';
import type { FeelEvent } from '../events';
import type { Intensity, PayoutTier } from '../intensity';

const HAPTIC_CUES = ['tap', 'heavy', 'success'];
const AUDIO_CUE_NAMES = Object.keys(CUES);
const ALL_TIERS: PayoutTier[] = ['small', 'medium', 'big', 'monster'];

const at = (tier: PayoutTier, value = 0.5): Intensity => ({ tier, value });

/** Representative events per FeelEvent type, each paired with the set of
 *  Intensity fixtures worth exercising (every tier where the recipe branches
 *  on `i.tier`/`i.value`; a single default otherwise). */
const CASES: { label: string; event: FeelEvent; intensities: Intensity[] }[] = [
  { label: 'HAND_START', event: { type: 'HAND_START', handNumber: 1 }, intensities: [at('small')] },
  {
    label: 'ACTION fold',
    event: { type: 'ACTION', action: 'fold', seatId: 1, slot: 'left', amountBB: 0 },
    intensities: [at('small')],
  },
  {
    label: 'ACTION check',
    event: { type: 'ACTION', action: 'check', seatId: 1, slot: 'left', amountBB: 0 },
    intensities: [at('small')],
  },
  {
    label: 'ACTION call',
    event: { type: 'ACTION', action: 'call', seatId: 1, slot: 'left', amountBB: 1 },
    intensities: [at('small')],
  },
  {
    // Chip-stack cue selects by intensity VALUE (S/M/L bands) — vary value.
    label: 'ACTION bet',
    event: { type: 'ACTION', action: 'bet', seatId: 1, slot: 'left', amountBB: 3 },
    intensities: [0.2, 0.5, 1].map((value) => at('small', value)),
  },
  {
    // Band boundaries: 0.4 (S→M) and 0.75 (M→L), both sides of each.
    label: 'ACTION raise',
    event: { type: 'ACTION', action: 'raise', seatId: 1, slot: 'center', amountBB: 6 },
    intensities: [0.39, 0.4, 0.74, 0.75].map((value) => at('small', value)),
  },
  {
    label: 'ACTION allin',
    event: { type: 'ACTION', action: 'allin', seatId: 1, slot: 'right', amountBB: 40 },
    intensities: [at('small')],
  },
  {
    label: 'ACTION postBlind (unreachable in prod, must not throw)',
    event: { type: 'ACTION', action: 'postBlind', seatId: 1, slot: 'left', amountBB: 0.5 },
    intensities: [at('small')],
  },
  {
    label: 'STREET_REVEAL flop (count 3)',
    event: { type: 'STREET_REVEAL', street: Street.Flop, count: 3 },
    intensities: [at('small')],
  },
  {
    label: 'STREET_REVEAL turn (count 1)',
    event: { type: 'STREET_REVEAL', street: Street.Turn, count: 1 },
    intensities: [at('small')],
  },
  {
    label: 'SWEEP',
    event: { type: 'SWEEP', from: [{ slot: 'hero', amount: 20 }] },
    intensities: [0, 0.3, 0.5, 1].map((value) => at('small', value)),
  },
  { label: 'TURN_START', event: { type: 'TURN_START' }, intensities: [at('small')] },
  {
    label: 'WIN heroWon',
    event: { type: 'WIN', heroWon: true, amount: 1000, winnerSlot: 'hero' },
    intensities: ALL_TIERS.map((t) => at(t)),
  },
  {
    label: 'WIN bot win',
    event: { type: 'WIN', heroWon: false, amount: 40, winnerSlot: 'left' },
    intensities: ALL_TIERS.map((t) => at(t)),
  },
  { label: 'HERO_BUST', event: { type: 'HERO_BUST' }, intensities: [at('small')] },
  { label: 'BOT_OUT', event: { type: 'BOT_OUT', slot: 'center' }, intensities: [at('small')] },
];

describe('RECIPES validator', () => {
  it('RECIPES has exactly one entry per FeelEvent type', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(
      [
        'HAND_START',
        'ACTION',
        'STREET_REVEAL',
        'SWEEP',
        'TURN_START',
        'WIN',
        'HERO_BUST',
        'BOT_OUT',
      ].sort(),
    );
  });

  for (const { label, event, intensities } of CASES) {
    it(`${label}: every step is a valid cue at a non-negative offset`, () => {
      for (const i of intensities) {
        const recipe = RECIPES[event.type](event, i);
        for (const step of recipe) {
          expect(step.at).toBeGreaterThanOrEqual(0);
          if (step.channel === 'audio') {
            expect(AUDIO_CUE_NAMES).toContain(step.cue);
          } else if (step.channel === 'scene') {
            expect(SCENE_FX).toContain(step.cue);
          } else if (step.channel === 'haptic') {
            expect(HAPTIC_CUES).toContain(step.cue);
          }
        }
      }
    });
  }

  it('ACTION bet/raise picks the chip-stack cue by intensity value bands (S <0.4, M 0.4-0.75, L >=0.75)', () => {
    const betEvent: FeelEvent = { type: 'ACTION', action: 'bet', seatId: 1, slot: 'left', amountBB: 3 };
    const stackCueAt = (value: number): string | undefined =>
      RECIPES.ACTION(betEvent, at('small', value)).find((s) => s.cue.startsWith('chipStack'))?.cue;

    expect(stackCueAt(0.2)).toBe('chipStackS');
    expect(stackCueAt(0.39)).toBe('chipStackS');
    expect(stackCueAt(0.4)).toBe('chipStackM');
    expect(stackCueAt(0.74)).toBe('chipStackM');
    expect(stackCueAt(0.75)).toBe('chipStackL');
    expect(stackCueAt(1)).toBe('chipStackL');
  });

  it('WIN monster event scales confetti count and win semitones off tier', () => {
    const recipe = RECIPES.WIN(
      { type: 'WIN', heroWon: true, amount: 1000, winnerSlot: 'hero' },
      at('monster'),
    );
    const confetti = recipe.find((s) => s.cue === 'confetti');
    const win = recipe.find((s) => s.cue === 'win');
    expect(confetti?.params).toMatchObject({ count: 56 });
    expect(win?.params).toMatchObject({ semitones: 4 });
  });

  it('WIN only adds the success haptic when heroWon', () => {
    const heroWin = RECIPES.WIN({ type: 'WIN', heroWon: true, amount: 40, winnerSlot: 'hero' }, at('small'));
    const botWin = RECIPES.WIN({ type: 'WIN', heroWon: false, amount: 40, winnerSlot: 'left' }, at('small'));
    expect(heroWin.some((s) => s.channel === 'haptic' && s.cue === 'success')).toBe(true);
    expect(botWin.some((s) => s.channel === 'haptic')).toBe(false);
  });

  it('WIN confetti step is gated behind minTier reduced', () => {
    const recipe = RECIPES.WIN({ type: 'WIN', heroWon: true, amount: 40, winnerSlot: 'hero' }, at('small'));
    const confetti = recipe.find((s) => s.cue === 'confetti');
    expect(confetti?.minTier).toBe('reduced');
  });

  it('STREET_REVEAL count 3 adds two extra cardFlip steps at 240/360', () => {
    const recipe = RECIPES.STREET_REVEAL({ type: 'STREET_REVEAL', street: Street.Flop, count: 3 }, at('small'));
    const flips = recipe.filter((s) => s.cue === 'cardFlip').map((s) => s.at);
    expect(flips.sort((a, b) => a - b)).toEqual([120, 240, 360]);
  });

  it('STREET_REVEAL count 1 has a single cardFlip', () => {
    const recipe = RECIPES.STREET_REVEAL({ type: 'STREET_REVEAL', street: Street.Turn, count: 1 }, at('small'));
    expect(recipe.filter((s) => s.cue === 'cardFlip')).toHaveLength(1);
  });

  it('SWEEP clink count follows 1+round(2*value), staggered 70ms off the 420ms land beat', () => {
    const recipe = RECIPES.SWEEP({ type: 'SWEEP', from: [{ slot: 'hero', amount: 20 }] }, at('small', 1));
    const clinks = recipe.filter((s) => s.cue === 'chipClink').map((s) => s.at);
    expect(clinks).toEqual([420, 490, 560]); // 1 + round(2*1) = 3 clinks
  });

  it('HAND_START ritual duration param matches the exported RITUAL_MS constant', () => {
    const recipe = RECIPES.HAND_START({ type: 'HAND_START', handNumber: 1 }, at('small'));
    const ritual = recipe.find((s) => s.cue === 'dealRitual');
    expect(ritual?.params).toEqual({ durMs: RITUAL_MS });
  });

  it('SCENE_FX matches the canonical list from the plan', () => {
    expect([...SCENE_FX].sort()).toEqual(
      [
        'dealBoard',
        'dealHole',
        'betStack',
        'sweep',
        'winPush',
        'rimFlash',
        'confetti',
        'turnSpotlight',
        'dealRitual',
        'camPunch',
      ].sort(),
    );
  });
});
