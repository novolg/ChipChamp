import type { ReactNode } from 'react';
import { useNavStore } from '../store/navStore';
import { useProgressStore } from '../store/progressStore';
import { LEARNING_PATH } from '../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../tutorial/content/quizzes';
import { isStepComplete } from '../../tutorial/progress/progressReducer';
import { useCountUp } from '../hooks/useCountUp';

interface AppFrameProps {
  /** Surface + header sizing. 'table' uses the darker table surface + 66px header. */
  variant?: 'learn' | 'table';
  /** Which top-nav pill is highlighted. Sub-screens (lesson/quiz/practice) use 'learn'. */
  active: 'learn' | 'free';
  /** Optional left-side header text, e.g. "BLINDS 10/20 · HAND 42". */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/** Chip counter + run progress bar, always visible in the header (game HUD). */
function ProgressHud() {
  const progress = useProgressStore((s) => s.progress);
  const done = LEARNING_PATH.filter((step) => isStepComplete(step, progress, QUIZZES_BY_ID)).length;
  const total = LEARNING_PATH.length;
  const shown = useCountUp(done, 600);

  return (
    <div className="hud" title={`${done} of ${total} steps complete`}>
      <img src="/assets/chip-orange.png" alt="" className="hud-chip" />
      <span className="hud-count" key={done}>{shown}<span className="hud-count-total">/{total}</span></span>
      <div className="hud-bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
        <span className="hud-bar-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** The product's screen chrome: a centered rounded frame floating on the suit
 *  field, with the logo wordmark, progress HUD and LEARN / FREE PLAY navigation. */
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
          <ProgressHud />
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
              FREE PLAY
            </button>
          </nav>
        </div>
      </header>
      <div className="frame-body">{children}</div>
    </div>
  );
}
