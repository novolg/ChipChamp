import {
  Assets,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  Texture,
  type Renderer,
} from 'pixi.js';
import type { Card, Suit } from '../engine/types';
import { rankLabel } from '../engine/evaluator';
import { tableLayout } from './layout';
import { markReady } from './readyState';

// Re-exported for plan fidelity (the splash gate's canonical import is the
// pixi-free `readyState.ts` directly — AppFrame must never statically import
// this module, which pulls in pixi.js).
export { isReady, subscribe } from './readyState';

/** A poker-chip denomination. Matches the physical chip PNGs in `public/assets`. */
export type ChipDenom = 1 | 5 | 10 | 25 | 100;

/**
 * Runtime card & chip textures — zero new art. Card faces are vector-drawn
 * (Graphics + Text) and baked once per (rank, suit, color-mode) into a
 * RenderTexture; chip textures stamp a white denomination label onto the
 * existing chip PNGs, baked once per denomination. Both are cached: repeat
 * calls return the SAME Texture instance (safe to hand to many Sprites).
 */
export interface SceneAssets {
  /** Cached card-face RenderTexture. `fourColor` selects the 4-color suit
   *  palette instead of the classic red/ink one. */
  cardFace(card: Card, fourColor: boolean): Texture;
  /** The shared card-back texture (falls back to `Texture.WHITE` if the PNG
   *  failed to load, so the scene never throws on a missing asset). */
  cardBack(): Texture;
  /** Cached chip texture for one denomination. */
  chip(denom: ChipDenom): Texture;
  /** Drops every cached card-face texture (both color modes) so the next
   *  `cardFace` call re-bakes it — call this when the user flips the
   *  4-color-deck setting. Chip textures are untouched. */
  clearCardCache(): void;
}

/**
 * Greedy largest-denomination-first chip breakdown for a chip amount, e.g.
 * `235` → `[{100,2},{25,1},{10,1}]`. Pure. Chips are integers by engine
 * invariant, so there is never a fractional remainder.
 */
export function chipBreakdown(amount: number): { denom: ChipDenom; count: number }[] {
  const out: { denom: ChipDenom; count: number }[] = [];
  let remaining = amount;
  for (const denom of CHIP_DENOMS) {
    const count = Math.floor(remaining / denom);
    if (count > 0) {
      out.push({ denom, count });
      remaining -= count * denom;
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Card face recipe — mirrors ui/components/table/Card.tsx + table.css:
 * rounded-rect paper card (radius 11), Oswald rank stacked above a suit
 * glyph, both centered; red/ink 2-color or the 4-color suit palette.
 * ------------------------------------------------------------------------- */

const SUIT_SYMBOL: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
const RED_SUITS: readonly Suit[] = ['d', 'h'];

/** Standard 4-color deck palette (brand-adjacent values per spec). */
const FOUR_COLOR_SUIT: Record<Suit, number> = {
  c: 0x2ed573, // clubs — green
  d: 0x3b8fff, // diamonds — blue
  h: 0xd12f43, // hearts — red (same as the 2-color scheme)
  s: 0x16181d, // spades — ink (same as the 2-color scheme)
};

const CARD_INK = 0x16181d; // --c-card-ink
const CARD_RED = 0xd12f43; // --c-card-red
const CARD_PAPER = 0xf6efe2; // --c-card-paper (warm ivory, indigo look), flattened

function suitColor(suit: Suit, fourColor: boolean): number {
  if (fourColor) return FOUR_COLOR_SUIT[suit];
  return RED_SUITS.includes(suit) ? CARD_RED : CARD_INK;
}

// Baked at 2x the scene's board card size (layout.ts, landscape — the smaller
// of the two on-table sizes; the hero size, 92x130, never exceeds double of
// it, so a cached face is never displayed upscaled).
const BASE_CARD = tableLayout('landscape');
const CARD_RES = 2;
const CARD_TEX_W = BASE_CARD.cardW * CARD_RES;
const CARD_TEX_H = BASE_CARD.cardH * CARD_RES;
const CARD_RADIUS = 11 * CARD_RES; // --r-card

let oswaldReady: Promise<void> | null = null;

/**
 * Best-effort wait for Oswald to be usable so canvas-rasterized card-face
 * Text doesn't measure/paint with a fallback font. Degrades silently
 * (resolves immediately) when the Font Loading API is unavailable — the face
 * still renders, just in whatever font the browser substitutes.
 */
function ensureOswaldLoaded(): Promise<void> {
  if (!oswaldReady) {
    oswaldReady = (async () => {
      try {
        const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
        if (!fonts) return;
        await fonts.load('600 32px Oswald');
        await fonts.ready;
      } catch {
        // Font Loading API missing or rejected — fall back silently.
      }
    })();
  }
  return oswaldReady;
}

function buildCardFace(renderer: Renderer, card: Card, fourColor: boolean): Texture {
  const w = CARD_TEX_W;
  const h = CARD_TEX_H;
  const color = suitColor(card.suit, fourColor);

  const frame = new Graphics()
    .roundRect(0, 0, w, h, CARD_RADIUS)
    .fill(CARD_PAPER)
    .stroke({ width: 2, color: CARD_INK, alpha: 0.18 });
  // Pinline: a slightly inset stroke, echoing the DOM recipe's inset ring.
  const inset = 4 * CARD_RES;
  const pinline = new Graphics()
    .roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(0, CARD_RADIUS - inset))
    .stroke({ width: 2, color: CARD_INK, alpha: 0.14 });

  // Weight 600 matches the DOM card's `.pcard-rank { font-weight: 600 }`
  // (Task 10 screenshot decision: 700 read a touch heavier than the DOM look).
  const rank = new Text({
    text: rankLabel(card.rank),
    style: { fontFamily: 'Oswald', fontWeight: '600', fontSize: Math.round(w * 0.46), fill: color },
  });
  const suit = new Text({
    text: SUIT_SYMBOL[card.suit],
    style: { fontFamily: 'Oswald', fontWeight: '600', fontSize: Math.round(w * 0.29), fill: color },
  });
  // Centered vertical stack (rank above suit), mirroring the DOM's
  // `flex-direction: column; align-items: center; justify-content: center`.
  const gap = 3 * CARD_RES;
  const blockH = rank.height + gap + suit.height;
  const top = (h - blockH) / 2;
  rank.anchor.set(0.5, 0);
  rank.position.set(w / 2, top);
  suit.anchor.set(0.5, 0);
  suit.position.set(w / 2, top + rank.height + gap);

  const view = new Container();
  view.addChild(frame, pinline, rank, suit);

  const texture = RenderTexture.create({ width: w, height: h });
  renderer.render({ container: view, target: texture });

  // Explicit, single-pass cleanup: destroy each child exactly once (rather
  // than `view.destroy({children:true})`, which would destroy them a SECOND
  // time and rely on internal double-destroy guards we shouldn't lean on).
  // `rank`/`suit` own a private rasterized glyph texture that must be freed
  // here or it leaks one GPU texture per bake; `frame`/`pinline` hold no
  // texture (flat-color fills only).
  frame.destroy();
  pinline.destroy();
  rank.destroy({ texture: true, textureSource: true });
  suit.destroy({ texture: true, textureSource: true });
  view.destroy();

  return texture;
}

/* ---------------------------------------------------------------------------
 * Chip texture recipe — existing chip PNG + a centered white denomination
 * label, baked once per denomination.
 * ------------------------------------------------------------------------- */

const CHIP_DENOMS: readonly ChipDenom[] = [100, 25, 10, 5, 1];

const CHIP_PNG: Record<ChipDenom, string> = {
  100: '/assets/chip-dark.png',
  25: '/assets/chip-green.png',
  10: '/assets/chip-blue.png',
  5: '/assets/chip-red.png',
  1: '/assets/chip-orange.png',
};

function buildChip(renderer: Renderer, denom: ChipDenom, base: Texture): Texture {
  const w = base.width;
  const h = base.height;

  const sprite = new Sprite(base);
  sprite.width = w;
  sprite.height = h;

  const label = new Text({
    text: String(denom),
    style: {
      fontFamily: 'Oswald',
      fontWeight: '700',
      fontSize: Math.round(w * 0.32),
      fill: 0xffffff,
      stroke: { color: 0x000000, width: Math.max(1, Math.round(w * 0.015)) },
    },
  });
  label.anchor.set(0.5);
  label.position.set(w / 2, h / 2);

  const view = new Container();
  view.addChild(sprite, label);

  const texture = RenderTexture.create({ width: w, height: h });
  renderer.render({ container: view, target: texture });

  // Single-pass cleanup (see buildCardFace). `sprite`'s texture is the
  // globally-cached chip PNG (Pixi's Assets cache, keyed by URL) — destroy
  // the sprite WITHOUT its texture. `label` owns a private rasterized
  // texture that must be freed explicitly.
  sprite.destroy();
  label.destroy({ texture: true, textureSource: true });
  view.destroy();

  return texture;
}

async function loadTextureOrWarn(url: string): Promise<Texture> {
  try {
    return await Assets.load<Texture>(url);
  } catch (err) {
    console.warn(`[scene/assets] failed to load "${url}"; falling back to a blank texture`, err);
    return Texture.WHITE;
  }
}

/**
 * Builds the runtime `SceneAssets`. Loads the card-back PNG and the 5 chip
 * base PNGs, each independently (`Assets.load`), so one missing file
 * degrades that texture to `Texture.WHITE` instead of failing the whole
 * scene; then waits for Oswald so card faces don't rasterize with a fallback
 * font. Card faces and chip labels are baked lazily, on first request, and
 * cached thereafter.
 */
export async function createAssets(renderer: Renderer): Promise<SceneAssets> {
  await ensureOswaldLoaded();

  const [cardBackTexture, ...chipBaseTextures] = await Promise.all([
    loadTextureOrWarn('/assets/card-back.png'),
    ...CHIP_DENOMS.map((denom) => loadTextureOrWarn(CHIP_PNG[denom])),
  ]);
  const chipBaseByDenom = new Map<ChipDenom, Texture>(
    CHIP_DENOMS.map((denom, i) => [denom, chipBaseTextures[i]]),
  );

  const cardCache = new Map<string, Texture>();
  const chipCache = new Map<ChipDenom, Texture>();

  function cardFace(card: Card, fourColor: boolean): Texture {
    const key = `${card.rank}-${card.suit}-${fourColor ? '4c' : '2c'}`;
    let texture = cardCache.get(key);
    if (!texture) {
      texture = buildCardFace(renderer, card, fourColor);
      cardCache.set(key, texture);
    }
    return texture;
  }

  function chip(denom: ChipDenom): Texture {
    let texture = chipCache.get(denom);
    if (!texture) {
      // Every ChipDenom is loaded into chipBaseByDenom above (falling back to
      // Texture.WHITE on a failed PNG), so .get is always defined here.
      const base = chipBaseByDenom.get(denom)!;
      texture = buildChip(renderer, denom, base);
      chipCache.set(denom, texture);
    }
    return texture;
  }

  function clearCardCache(): void {
    for (const texture of cardCache.values()) texture.destroy(true);
    cardCache.clear();
  }

  // Flips the splash's assets-ready gate (src/scene/readyState.ts). Idempotent,
  // so re-entering the Play screen (a fresh `createAssets` call) is harmless.
  markReady();

  return {
    cardFace,
    cardBack: () => cardBackTexture,
    chip,
    clearCardCache,
  };
}
