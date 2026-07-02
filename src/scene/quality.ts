import type { Settings } from '../ui/store/settingsStore';
// QualityTier is DEFINED in feel/recipes.ts (the recipe table gates on it);
// quality.ts imports and re-exports the SAME type rather than redefining it.
import type { QualityTier } from '../feel/recipes';

export type { QualityTier };

/** Result of the WebGL capability probe: the best context that could be made. */
export type WebGLProbeResult = 'webgl2' | 'webgl1' | null;

/**
 * Detect the best WebGL context available in the current environment.
 * Browser-only; returns null when the DOM is unavailable (SSR / node test env)
 * or when context creation throws. Tests inject their own probe instead.
 *
 * Note: this only reports WebGL capability. Pixi v8 may still prefer WebGPU at
 * init; a failed Pixi init is handled separately by TableScene (→ DOM fallback).
 */
export function defaultProbe(): WebGLProbeResult {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    if (canvas.getContext('webgl2')) return 'webgl2';
    if (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) return 'webgl1';
    return null;
  } catch {
    return null;
  }
}

/**
 * Map the user's renderer setting to a concrete quality tier.
 *  - 'dom'                 → 'dom' (forced DOM fallback)
 *  - 'full' / 'reduced'    → forced through unchanged
 *  - 'auto'                → probe: WebGL2 → 'full', WebGL1 only → 'reduced',
 *                            neither → 'dom'
 *
 * `probe` is injected so the 'auto' branch is unit-testable in the node env
 * (Pixi/WebGL cannot run there).
 */
export function resolveTier(
  setting: Settings['renderer'],
  probe: () => WebGLProbeResult = defaultProbe,
): QualityTier {
  if (setting === 'dom' || setting === 'full' || setting === 'reduced') return setting;
  // 'auto'
  switch (probe()) {
    case 'webgl2':
      return 'full';
    case 'webgl1':
      return 'reduced';
    default:
      return 'dom';
  }
}
