/* Shared Framer Motion presets so motion reads consistently app-wide.
 *
 * Framer owns entrance/exit/layout/gesture choreography; the CSS @keyframes in
 * theme/global.css + table.css stay responsible for infinite idle loops (bot
 * bob/blink, felt breathe, sheen). prefers-reduced-motion is handled globally
 * by <MotionConfig reducedMotion="user"> in App.tsx — these presets don't need
 * to guard it themselves. */

import type { Transition, Variants } from 'framer-motion';

// ---- springs (mirror the token easing intents) ----
/** soft spring — hover lifts, nav-thumb feel (≈ --ease-snap). */
export const springSoft: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 };
/** snappy overshoot — pills, key-caps, pops (≈ --ease-spring). */
export const springSnappy: Transition = { type: 'spring', stiffness: 600, damping: 26, mass: 0.7 };
/** bouncy — celebratory pops (stars, level-up, win banner). */
export const springBouncy: Transition = { type: 'spring', stiffness: 520, damping: 17, mass: 0.9 };

/** standard decel ease (≈ --ease-out token). */
export const easeOut: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
/** card deal/flip ease (≈ --ease-flip token). */
export const easeFlip: [number, number, number, number] = [0.2, 0.8, 0.3, 1.1];

// ---- screen transitions (AnimatePresence in App.tsx) ----
// Opacity + vertical slide only — NO scale. The frame inside already carries
// transform: scale(var(--fit-scale)); a scale here would compose multiplicatively
// and shrink the frame ~1.5% mid-transition. translateY is an absolute offset, so
// it composes cleanly with the child scale.
export const screenVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.34, ease: easeOut } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2, ease: easeOut } },
};

// ---- staggered content reveal (lesson blocks, coaching tiles) ----
export const staggerContainer: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.42, ease: easeOut } },
};

// ---- quiz question swap (horizontal slide) ----
export const questionVariants: Variants = {
  initial: { opacity: 0, x: 40 },
  enter: { opacity: 1, x: 0, transition: { duration: 0.32, ease: easeOut } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.22, ease: easeOut } },
};

// ---- celebratory pop (stars, badges, level chips) ----
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.4, rotate: -12 },
  enter: { opacity: 1, scale: 1, rotate: 0, transition: springBouncy },
};
