import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { useGameStore, HERO_STARTING_STACK } from '../store/gameStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSettingsStore } from '../store/settingsStore';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { completedStepCount, learnerLevel, heroChipBalance } from '../lib/derive';
import { useCountUp } from '../hooks/useCountUp';
import { useSound } from '../hooks/useSound';
import { playSfx } from '../lib/sound';
import { subscribe, isReady } from '../../scene/readyState';
import { SettingsModal } from './SettingsModal';
import { SaloonAmbience } from './SaloonAmbience';

/* Session-scoped high-water mark of the step count we've already celebrated.
 * null until the first mount syncs it, so a page load never auto-fires the
 * burst — only a real step completion during the session does. Module scope
 * survives the AppFrame remounts that happen on every screen change. */
let celebratedDone: number | null = null;

/** Speaker toggle for the synthesised SFX (state persists in localStorage). */
function SfxToggle() {
  const { muted, toggle } = useSound();
  return (
    <button
      type="button"
      className="sfx-toggle"
      data-muted={muted}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M4 9v6h4l5 4V5L8 9H4z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {muted ? (
          <path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <>
            <path d="M16 9.5a4 4 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M18.5 7.5a7 7 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  );
}

/** Gear button that opens the settings modal. Same sunken-circle idiom as
 *  the SFX mute toggle next to it; `buttonRef` lets the modal return focus
 *  here on close. */
function SettingsToggle({ onOpen, buttonRef }: { onOpen: () => void; buttonRef: RefObject<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className="settings-toggle"
      aria-label="Open settings"
      title="Settings"
      onClick={onOpen}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.02 5.98l-1.7 1.7M7.68 16.32l-1.7 1.7M18.02 18.02l-1.7-1.7M7.68 7.68l-1.7-1.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

interface AppFrameProps {
  /** Surface + header sizing. 'table' uses the darker table surface + 66px header. */
  variant?: 'learn' | 'table';
  /** Which top-nav pill is highlighted. Sub-screens (lesson/quiz/practice) use 'learn'. */
  active: 'learn' | 'free';
  /** Optional left-side header text, e.g. "BLINDS 10/20 · HAND 42". */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/** SVG level-ring HUD (spec §7): fill fraction is completed steps ÷ total
 *  learning-path steps — the exact derivation the old `ProgressChips` row
 *  used, now shared via `derive.ts` with the felt's hero avatar level badge
 *  (TableScene.tsx) so the two numbers can never drift apart. The level
 *  number sits centered inside the ring. Preserves `ProgressChips`' level-up
 *  cue (the `levelUp` SFX, fired the first time a session observes a higher
 *  step count) — the old per-chip burst is now a pulse around the ring. */
function LevelRing() {
  const progress = useProgressStore((s) => s.progress);
  const reducedMotion = useReducedMotion();
  const done = completedStepCount(progress);
  const total = LEARNING_PATH.length;
  const level = learnerLevel(progress);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (celebratedDone === null) {
      celebratedDone = done; // sync silently on first mount
      return;
    }
    if (done > celebratedDone) {
      celebratedDone = done;
      setBurst((k) => k + 1);
      playSfx('levelUp');
    }
  }, [done]);

  const radius = 11.5;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? done / total : 0;
  const dashoffset = circumference * (1 - fraction);

  return (
    <div
      className="hud-ring-wrap"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      title={`${done} of ${total} steps complete`}
    >
      <svg className="hud-ring" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle className="hud-ring-track" cx="14" cy="14" r={radius} />
        <circle
          className="hud-ring-fill"
          cx="14"
          cy="14"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: dashoffset,
            // Settings-forced reduced motion isn't covered by the global
            // `prefers-reduced-motion` CSS kill-switch (that only sees the OS
            // signal), so the fill snap needs an explicit override here.
            transitionDuration: reducedMotion ? '0s' : undefined,
          }}
        />
      </svg>
      <span className="hud-ring-level">{level}</span>
      {!reducedMotion && (
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              className="hud-ring-pulse"
              aria-hidden="true"
              initial={{ opacity: 0.85, scale: 0.6 }}
              animate={{ opacity: 0, scale: 1.9 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              onAnimationComplete={() => setBurst(0)}
            />
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

/** Chip-balance readout: the hero's live stack from `gameStore` (or the
 *  starting stack before the first deal), rolling via the existing
 *  `useCountUp` odometer. A `+n` pill appears on an increase only — never on
 *  a decrease, and never on the null→number transition at first deal (the
 *  hero's stack can only hold or shrink from blinds between "no game yet"
 *  and "hand dealt", so that transition is never itself an increase). Keyed
 *  on the balance value so each new increase gets a fresh DOM node and
 *  replays the CSS pop from scratch. */
function ChipBalance() {
  const game = useGameStore((s) => s.game);
  const reducedMotion = useReducedMotion();
  const balance = heroChipBalance(game, HERO_STARTING_STACK);
  const shown = useCountUp(balance);
  const prevRef = useRef(balance);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = balance;
    if (balance > prev) setDelta(balance - prev);
  }, [balance]);

  // Dismissal is a plain timer (not `onAnimationEnd`) so it works the same
  // whether the pop is animating, snapped by the global reduced-motion
  // kill-switch, or snapped by the in-app reducedMotion setting.
  useEffect(() => {
    if (delta === null) return;
    const t = window.setTimeout(() => setDelta(null), reducedMotion ? 500 : 900);
    return () => window.clearTimeout(t);
  }, [delta, reducedMotion]);

  return (
    <div className="hud-balance">
      <img src="/assets/chip-orange.png" alt="" className="hud-balance-chip" aria-hidden="true" />
      <span className="hud-balance-amount">{shown.toLocaleString()}</span>
      {delta !== null && (
        <span
          key={balance}
          className={`hud-balance-pop${reducedMotion ? ' hud-balance-pop-static' : ''}`}
          aria-hidden="true"
        >
          +{delta.toLocaleString()}
        </span>
      )}
    </div>
  );
}

/** HUD cluster in the header: level ring, chip balance, and a reserved empty
 *  slot for the Phase 4 streak feature. Replaces the old per-step chip row. */
function Hud() {
  return (
    <div className="hud">
      <LevelRing />
      <ChipBalance />
      <span className="hud-streak-slot" aria-hidden="true" />
    </div>
  );
}

/* Minimum time the splash stays up even if fonts + assets resolve
 * immediately (avoids an imperceptible flash on a warm cache). */
const SPLASH_MIN_MS = 400;
/* Opacity fade-out length once every gate condition is satisfied. Kept even
 * under reduced motion — only the spinner's rotation is cut there. */
const SPLASH_FADE_MS = 300;
/* Hard cap: the assets-ready gate can stall forever if WebGL init fails and
 * the scene falls back to the DOM renderer before ever calling
 * `createAssets`, or the GPU context is lost before the first frame — the
 * splash must never be able to hang the app on a signal that may never fire. */
const SPLASH_HARD_CAP_MS = 4000;

/* Module-scope: true once the splash has been shown & dismissed for this page
 * load. AppFrame remounts on every screen change (see `celebratedDone`
 * above), so this can't be component state. The lazy `useState` initializer
 * below only READS this value during render (never mutates it), so
 * StrictMode's double-invoked render is safe; it's WRITTEN only from the
 * effect that finishes the hide sequence. */
let splashDone = false;

/** Resolves true once `document.fonts` reports ready — or immediately if the
 *  Font Loading API is unavailable (mirrors `scene/assets.ts`'s Oswald wait,
 *  which degrades the same way). */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(() => !document.fonts);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

/** Full-viewport branded preload gate — wordmark + a rotating chip mark —
 *  shown from first paint until fonts (always) and, only when booting into
 *  the WebGL Play route, the scene's first asset batch (`scene/readyState.ts`)
 *  are ready; hides after a 400ms minimum and a 300ms fade, with a 4s hard
 *  cap so a stalled gate can never hang the app. Once-per-load via the
 *  `splashDone` module flag above. Portaled to `document.body`: `.frame`'s
 *  `transform: scale(...)` would otherwise reparent a `position: fixed`
 *  child's containing block to `.frame` itself (and its `overflow: hidden`
 *  would clip it) — see the `.settings-backdrop` comment in screens.css for
 *  the same quirk — so a true full-viewport overlay above `.app-stage` has
 *  to live outside that subtree. */
function Splash() {
  const [visible, setVisible] = useState(() => !splashDone);
  const [fading, setFading] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [hardCapped, setHardCapped] = useState(false);

  const fontsReady = useFontsReady();
  const assetsReady = useSyncExternalStore(subscribe, isReady);
  const view = useNavStore((s) => s.view);
  const renderer = useSettingsStore((s) => s.settings.renderer);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    const minTimer = window.setTimeout(() => setMinTimeElapsed(true), SPLASH_MIN_MS);
    const hardCapTimer = window.setTimeout(() => setHardCapped(true), SPLASH_HARD_CAP_MS);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(hardCapTimer);
    };
  }, [visible]);

  // Only the Play route ever spins up the WebGL scene; the DOM renderer
  // never calls `createAssets`, so the gate must not wait on it there.
  const needsAssets = view.name === 'free' && renderer !== 'dom';
  const gateOpen = fontsReady && (!needsAssets || assetsReady);
  const ready = (gateOpen && minTimeElapsed) || hardCapped;

  // `hidingRef` makes this fire exactly once. It deliberately does NOT depend
  // on `fading`: setting `fading` true is itself a state update inside this
  // effect, and including it in the deps would make React tear down (and
  // cancel the pending timeout of) this very effect on the next render —
  // the fade would start but `setVisible(false)` would never fire.
  const hidingRef = useRef(false);
  useEffect(() => {
    if (!visible || hidingRef.current || !ready) return;
    hidingRef.current = true;
    setFading(true);
    const t = window.setTimeout(() => {
      splashDone = true;
      setVisible(false);
    }, SPLASH_FADE_MS);
    return () => window.clearTimeout(t);
  }, [visible, ready]);

  if (!visible) return null;

  return createPortal(
    <div
      className={`splash${fading ? ' splash-fading' : ''}${reducedMotion ? ' splash-static' : ''}`}
      aria-hidden="true"
    >
      <img src="/assets/logo-wordmark.png" alt="" className="splash-wordmark" />
      <span className="splash-spinner">
        <img src="/assets/chip-orange.png" alt="" className="splash-spinner-chip" />
      </span>
    </div>,
    document.body,
  );
}

/** The product's screen chrome: a centered rounded frame floating on the suit
 *  field, with the logo wordmark, the level-ring/balance HUD and LEARN / PLAY
 *  navigation. Also mounts the once-per-load branded splash (portaled out to
 *  `document.body` — see `Splash`'s doc comment). */
export function AppFrame({ variant = 'learn', active, headerExtra, children }: AppFrameProps) {
  const hasTableControl = useGameStore((s) => s.hasTableControl);
  const progressSaved = useProgressStore((s) => s.saved);
  const progressSaving = useProgressStore((s) => s.saving);
  const go = useNavStore((s) => s.go);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const focusContent = () => {
    const body = bodyRef.current;
    if (!body) return;
    const target = active === 'free' ? body : body.querySelector<HTMLElement>('h1, h2') ?? body;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  };
  useEffect(() => {
    // Child exercises may establish a more specific initial focus of their own.
    // Leave browser focus alone on the initial page load (especially touch).
    if (!useNavStore.getState().hasNavigated) return;
    if (!bodyRef.current?.contains(document.activeElement)) focusContent();
  }, []);

  const closeSettings = () => {
    setSettingsOpen(false);
  };

  return (
    <div className={`frame frame-${variant}`}>
      <button className="skip-content" onClick={focusContent}>Skip to content</button>
      <Splash />
      {variant === 'table' && !reducedMotion && <SaloonAmbience />}
      <header className={`frame-header frame-header-${variant}`}>
        <div className="frame-brand">
          <img src="/assets/logo-wordmark.png" alt="ChipChamp" className="frame-logo" />
          {headerExtra && <span className="frame-header-extra">{headerExtra}</span>}
        </div>
        <div className="frame-right">
          <Hud />
          <SfxToggle />
          <SettingsToggle onOpen={() => setSettingsOpen(true)} buttonRef={gearRef} />
          <nav className="nav-switch" aria-label="Main navigation">
            {/* Sliding active surface; segs are transparent on top of it. */}
            <span className="nav-thumb" data-pos={active} aria-hidden="true" />
            <button
              aria-current={active === 'learn' ? 'page' : undefined}
              className={`nav-seg${active === 'learn' ? ' nav-seg-active' : ''}`}
              onClick={() => go({ name: 'home' })}
            >
              LEARN
            </button>
            <button
              aria-current={active === 'free' ? 'page' : undefined}
              className={`nav-seg${active === 'free' ? ' nav-seg-active' : ''}`}
              onClick={() => go({ name: 'free' })}
              aria-label="Free play"
            >
              {/* "FREE " drops on phones so the pill fits one line (screens.css mobile block). */}
              <span className="nav-seg-free-word">FREE </span>PLAY
            </button>
          </nav>
        </div>
      </header>
      <div ref={bodyRef} className="frame-body" role="region" aria-label={active === 'free' ? 'Poker table' : 'Learning content'} tabIndex={-1}>{!hasTableControl && <p className="table-ownership-note" role="status">Your table is open in another tab. Close that tab to continue playing here. Lessons remain available.</p>}{!progressSaved && !progressSaving && <p className="table-ownership-note" role="status">Your latest progress couldn’t be saved. Keep this tab open; we’ll try again when you complete another activity.</p>}{children}</div>
      {settingsOpen && <SettingsModal onClose={closeSettings} returnFocusRef={gearRef} />}
    </div>
  );
}
