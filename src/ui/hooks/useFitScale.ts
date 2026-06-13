import { useLayoutEffect, useState } from 'react';

/** Design size of the frame canvas (must match .frame in screens.css). */
const W = 1240;
const H = 880;
const MARGIN = 12;

/**
 * Uniform scale factor that fits the fixed 1240x880 frame inside the viewport
 * (capped at 1 — never upscales). App.tsx feeds it to `.frame` via the
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
      setScale(Math.min(1, Math.round((vw / W) * 1000) / 1000, Math.round((vh / H) * 1000) / 1000));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}
