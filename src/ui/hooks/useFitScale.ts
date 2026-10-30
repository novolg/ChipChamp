import { useLayoutEffect, useState } from 'react';

/** Design size of the frame canvas (must match .frame in screens.css). */
const W = 1440;
const H = 900;
const MARGIN = 0;
/** Big screens upscale a little so the table fills the window (indigo look is
 *  edge-to-edge); the Pixi canvas re-rasterises at the scaled resolution. */
const MAX_SCALE = 1.3;

/**
 * Uniform scale factor that fits the fixed 1440x900 frame inside the viewport
 * (capped at MAX_SCALE). App.tsx feeds it to `.frame` via the
 * `--fit-scale` custom property on `.app-stage`.
 *
 * Browsers hit-test through CSS transforms natively, so buttons and the native
 * range input keep working untouched. Any FUTURE manual pointer math
 * (getBoundingClientRect drag deltas) must divide deltas by this scale.
 * Scale is rounded to 3 decimals to avoid shimmer on resize.
 */
export function useFitScale(): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const update = () => {
      const vw = document.documentElement.clientWidth - MARGIN * 2;
      const vh = document.documentElement.clientHeight - MARGIN * 2;
      setScale(Math.min(MAX_SCALE, Math.round((vw / W) * 1000) / 1000, Math.round((vh / H) * 1000) / 1000));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}
