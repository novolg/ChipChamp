import type { ReactNode } from 'react';
import { useNavStore } from '../store/navStore';

interface AppFrameProps {
  /** Surface + header sizing. 'table' uses the darker table surface + 66px header. */
  variant?: 'learn' | 'table';
  /** Which top-nav pill is highlighted. Sub-screens (lesson/quiz/practice) use 'learn'. */
  active: 'learn' | 'free';
  /** Optional left-side header text, e.g. "BLINDS 10/20 · HAND 42". */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/** The product's screen chrome: a centered rounded frame floating on the suit
 *  field, with the logo wordmark and LEARN / FREE PLAY navigation pills. */
export function AppFrame({ variant = 'learn', active, headerExtra, children }: AppFrameProps) {
  const go = useNavStore((s) => s.go);

  return (
    <div className={`frame frame-${variant}`}>
      <header className={`frame-header frame-header-${variant}`}>
        <div className="frame-brand">
          <img src="/assets/logo-wordmark.png" alt="ChipChamp" className="frame-logo" />
          {headerExtra && <span className="frame-header-extra">{headerExtra}</span>}
        </div>
        <nav className="nav-switch" role="tablist">
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
      </header>
      <div className="frame-body">{children}</div>
    </div>
  );
}
