import type { CSSProperties } from 'react';

const COLORS = ['#ffa502', '#006efd', '#ff4757', '#2ed573', '#ffd166'];

/** CSS-only celebration burst: falling chips of the brand palette.
 *  Parent must be position: relative (or fixed); pieces are pointer-transparent.
 *  Variation is index-derived so the burst is stable across re-renders. */
export function Confetti({ count = 28 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const style: CSSProperties = {
          left: `${(i * 37 + 11) % 100}%`,
          background: COLORS[i % COLORS.length],
          animationDelay: `${((i * 13) % 12) / 20}s`,
          animationDuration: `${1.3 + ((i * 7) % 8) / 10}s`,
          ['--drift' as string]: `${((i * 29) % 90) - 45}px`,
          ['--spin' as string]: `${260 + ((i * 47) % 420)}deg`,
        };
        return <span key={i} className="confetti-piece" style={style} />;
      })}
    </div>
  );
}
