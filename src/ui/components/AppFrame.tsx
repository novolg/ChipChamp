import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { isStepComplete } from '../../tutorial/progress/progressReducer';
import { useSound } from '../hooks/useSound';
import { playSfx } from '../lib/sound';

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

interface AppFrameProps {
  /** Surface + header sizing. 'table' uses the darker table surface + 66px header. */
  variant?: 'learn' | 'table';
  /** Which top-nav pill is highlighted. Sub-screens (lesson/quiz/practice) use 'learn'. */
  active: 'learn' | 'free';
  /** Optional left-side header text, e.g. "BLINDS 10/20 · HAND 42". */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/** Run-progress chips in the header: one chip per learning step, lit as you
 *  complete them. Each coin-flips on hover; the newest earned chip blooms a
 *  burst + sting the first time we observe a higher count this session. */
function ProgressChips() {
  const progress = useProgressStore((s) => s.progress);
  const done = LEARNING_PATH.filter((step) => isStepComplete(step, progress, QUIZZES_BY_ID)).length;
  const total = LEARNING_PATH.length;
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

  return (
    <div
      className="hdr-chips"
      title={`${done} of ${total} steps complete`}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      {Array.from({ length: total }).map((_, i) => {
        const earned = i < done;
        return (
          <span key={i} className="hdr-chip-wrap">
            <img
              src={earned ? '/assets/chip-orange.png' : '/assets/chip-dark.png'}
              alt=""
              className={`hdr-chip${earned ? ' hdr-chip-earned' : ''}`}
            />
            {earned && i === done - 1 && (
              <AnimatePresence>
                {burst > 0 && (
                  <motion.span
                    key={burst}
                    className="hdr-burst"
                    aria-hidden="true"
                    initial={{ opacity: 0.85, scale: 0.35 }}
                    animate={{ opacity: 0, scale: 2.2 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    onAnimationComplete={() => setBurst(0)}
                  />
                )}
              </AnimatePresence>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The product's screen chrome: a centered rounded frame floating on the suit
 *  field, with the logo wordmark, progress chips and LEARN / PLAY navigation. */
export function AppFrame({ variant = 'learn', active, headerExtra, children }: AppFrameProps) {
  const go = useNavStore((s) => s.go);

  return (
    <div className={`frame frame-${variant}`}>
      <header className={`frame-header frame-header-${variant}`}>
        <div className="frame-brand">
          <img src="/assets/logo-wordmark.png" alt="ChipChamp" className="frame-logo" />
          {headerExtra && <span className="frame-header-extra">{headerExtra}</span>}
        </div>
        <div className="frame-right">
          <ProgressChips />
          <SfxToggle />
          <nav className="nav-switch" role="tablist">
            {/* Sliding active surface; segs are transparent on top of it. */}
            <span className="nav-thumb" data-pos={active} aria-hidden="true" />
            <button
              role="tab"
              aria-selected={active === 'learn'}
              className={`nav-seg${active === 'learn' ? ' nav-seg-active' : ''}`}
              onClick={() => go({ name: 'home' })}
            >
              LEARN
            </button>
            <button
              role="tab"
              aria-selected={active === 'free'}
              className={`nav-seg${active === 'free' ? ' nav-seg-active' : ''}`}
              onClick={() => go({ name: 'free' })}
            >
              PLAY
            </button>
          </nav>
        </div>
      </header>
      <div className="frame-body">{children}</div>
    </div>
  );
}
