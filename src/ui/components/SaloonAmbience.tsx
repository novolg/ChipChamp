import './saloonAmbience.css';

/** Lantern / candle glow spots, as % of the 1920x1200 `bg-saloon.png`. The
 *  table frame is the same 1.6 aspect and the image is `cover`, so % of the
 *  image == % of the frame. `s` = glow diameter (px), `d` = flicker period (s). */
const LANTERNS: { x: number; y: number; s: number; d: number }[] = [
  { x: 1, y: 7, s: 150, d: 3.1 },
  { x: 15.1, y: 16, s: 120, d: 2.6 },
  { x: 24.6, y: 20.4, s: 80, d: 3.7 },
  { x: 31.7, y: 11, s: 140, d: 2.9 },
  { x: 40, y: 1.5, s: 120, d: 3.4 },
  { x: 51.6, y: 1, s: 120, d: 2.7 },
  { x: 60.4, y: 9, s: 150, d: 3.2 },
  { x: 67.7, y: 4.5, s: 120, d: 2.5 },
  { x: 69.5, y: 20, s: 80, d: 3.9 },
  { x: 74.7, y: 16.5, s: 110, d: 3.0 },
  { x: 98.4, y: 8.5, s: 160, d: 2.8 },
  { x: 4, y: 18, s: 70, d: 1.9 }, // candles, left counter
  { x: 84.3, y: 21, s: 70, d: 2.1 }, // candles, right counter
];

/** Warm floor reflections under the lanterns: x% of each streak's centre. */
const REFLECTIONS = [12, 21.5, 68.5, 87.5];

/** Moonlit windows: x/y % of their centres. */
const WINDOWS = [
  { x: 7.5, y: 15 },
  { x: 39.6, y: 14 },
  { x: 90, y: 15 },
];

/** Dust motes drifting up through the lantern light. Index-derived spread
 *  (no Math.random) so the layout is stable across renders. */
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  x: (i * 37 + 11) % 100,
  y: 30 + ((i * 53) % 55),
  d: 16 + ((i * 7) % 11),
  delay: -((i * 3.3) % 20),
}));

/** Subtle living backdrop for the Free Play table: soft lantern swells, a neon
 *  sign that dims softly now and then, breathing floor reflections and window
 *  moonlight, and slow dust motes. Pure CSS (opacity/transform only), sits
 *  under all frame content (z-index -1 inside the frame's stacking context).
 *  AppFrame skips it under reduced motion, so the static image remains. */
export function SaloonAmbience() {
  return (
    <div className="saloon-amb" aria-hidden="true">
      {WINDOWS.map((w, i) => (
        <span
          key={`w${i}`}
          className="amb-window"
          style={{ left: `${w.x}%`, top: `${w.y}%`, animationDelay: `${-i * 4}s` }}
        />
      ))}
      {REFLECTIONS.map((x, i) => (
        <span
          key={`r${i}`}
          className="amb-reflect"
          style={{ left: `${x}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${6 + i}s` }}
        />
      ))}
      {LANTERNS.map((l, i) => (
        <span
          key={`l${i}`}
          className="amb-lantern"
          style={{
            left: `${l.x}%`,
            top: `${l.y}%`,
            width: l.s,
            height: l.s,
            animationDuration: `${l.d * 2}s`, // slow, smooth swells
            animationDelay: `${-i * 0.73}s`,
          }}
        />
      ))}
      <span className="amb-neon" style={{ left: '51%', top: '13.3%' }} />
      {MOTES.map((m, i) => (
        <span
          key={`m${i}`}
          className="amb-mote"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            animationDuration: `${m.d}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
