// Tunable knobs for the rule-based bot. Kept in one place so difficulty and
// personality are easy to adjust.

export interface BotConfig {
  /** 0..1 — how often the bot bets/raises with strong hands and semi-bluffs. */
  aggression: number;
  /** 0..1 — chance of bluffing with a weak hand in good spots. */
  bluffFreq: number;
  /** 0..1 — higher folds more marginal hands preflop. */
  tightness: number;
}

export const DEFAULT_BOT: BotConfig = {
  aggression: 0.55,
  bluffFreq: 0.1,
  tightness: 0.5,
};

export const BOT_PRESETS: Record<'easy' | 'medium' | 'hard', BotConfig> = {
  easy: { aggression: 0.35, bluffFreq: 0.18, tightness: 0.3 },
  medium: { aggression: 0.55, bluffFreq: 0.1, tightness: 0.5 },
  hard: { aggression: 0.7, bluffFreq: 0.08, tightness: 0.65 },
};

/** Bet/raise sizing as a fraction of the current pot. */
export const BET_FRACTION = 0.6;
