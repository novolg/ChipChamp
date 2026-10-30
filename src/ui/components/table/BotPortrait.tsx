import { Component, lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ActionType } from '../../../engine/types';
import type { BotId, Emotion } from './BotFace';
import type { GazeVec } from '../../hooks/useGazeDirector';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import './botportrait.css';

/** Seat role shown on the plate + coach posse (cyber-cowboy cast). */
export const BOT_ROLE: Record<BotId, string> = { ava: 'Sheriff', ben: 'Outlaw', cleo: 'Gunslinger' };

interface BotPortraitProps {
  bot: BotId;
  emotion: Emotion;
  /** Bump to replay the emotion's entry jolt (keys the pose remount). */
  emotionSeq: number;
  gaze?: GazeVec;
  /** Out of the hand: bots that ship a dedicated slumped render swap to it. */
  folded?: boolean;
  /** Seat is to act — drives the 3D bot's lean + visor pulse. */
  acting?: boolean;
  /** Latest street action; a new seq plays its 3D gesture. */
  action?: { type: ActionType; seq: number };
  /** Live 3D model allowed (Pixi tiers). False on the DOM fallback table. */
  use3d?: boolean;
}

/** Bots with a real-time 3D model (Claude Design GLB). The rest use the PNG cut-out. */
const MODEL: Partial<Record<BotId, string>> = {
  ava: '/assets/bots/sheriff.glb',
  ben: '/assets/bots/outlaw.glb',
  cleo: '/assets/bots/drifter.glb',
};
const PHASE: Record<BotId, number> = { ava: 0, ben: 1.3, cleo: 2.6 };
// three.js is split into its own chunk — loaded only when a 3D bot mounts.
const BotModel3D = lazy(() => import('./BotModel3D'));

/** Catches a failed three.js chunk load (render-time throw) → PNG. */
class ModelBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[BotPortrait] 3D model failed; using the portrait.', err);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Bots with a `bot-{id}-folded.png` render (the rest dim via CSS). */
const FOLDED_ART: ReadonlySet<BotId> = new Set(['ben']);

/**
 * Pre-rendered 3D cyber-cowboy portrait (Midnight Indigo look) — a cut-out
 * Lossless WebP from `public/assets/indigo/`, brought to life with CSS only: idle
 * breathing, a gaze lean driven by useGazeDirector, and a per-emotion pose
 * (hop on confident/happy, jolt on shocked, slump on sad/asleep). Seat-level
 * states (acting glow, folded dim) are styled from the parent `.botseat-*`
 * classes in botportrait.css. Bots listed in MODEL render as a live three.js
 * model instead (BotModel3D, lazy-loaded).
 */
export function BotPortrait({ bot, emotion, emotionSeq, gaze, folded, acting, action, use3d }: BotPortraitProps) {
  const still = useReducedMotion();
  // Sticky per mount: once WebGL / the model fails, this seat stays on the PNG.
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const model = use3d && !failed ? MODEL[bot] : undefined;
  useEffect(() => { if (!model) setReady(false); }, [model]);
  const art = folded && FOLDED_ART.has(bot) ? `bot-${bot}-folded` : `bot-${bot}`;
  const style = {
    // Gaze vectors are tuned for the 56px SVG face; scale up for the portrait.
    '--gx': `${(gaze?.x ?? 0) * 2.4}px`,
    '--gy': `${(gaze?.y ?? 0) * 1.6}px`,
    '--gt': `${(gaze?.tilt ?? 0) * 1.2}deg`,
  } as CSSProperties;
  if (model) {
    // 3D bot owns its gaze, pose and gestures — no CSS transforms on top.
    return (
      <div className={`bp bp-${bot} bp-3d`} data-avatar-status={ready ? (still ? '3D · motion reduced' : '3D active') : 'Loading 3D model'}>
        <span className="bp-floor" aria-hidden="true" />
        {!ready && <img className="bp-img" src={`/assets/indigo/bot-${bot}.webp`} alt="" draggable={false} />}
        <ModelBoundary onFail={() => setFailed('3D module could not load')}>
        <Suspense fallback={null}>
          <BotModel3D
            src={model}
            phase={PHASE[bot]}
            emotion={emotion}
            emotionSeq={emotionSeq}
            gaze={gaze}
            folded={!!folded}
            acting={!!acting}
            action={action}
            still={still}
            onFail={setFailed}
            onReady={() => setReady(true)}
          />
        </Suspense>
        </ModelBoundary>
      </div>
    );
  }
  return (
    <div className={`bp bp-${bot}`} style={style} data-avatar-status={failed ?? 'Portrait · table is using reduced or fallback graphics'}>
      <span className="bp-floor" aria-hidden="true" />
      <div className="bp-gaze">
        <div key={`${emotion}-${emotionSeq}`} className={`bp-pose bp-emo-${emotion}`}>
          <img className="bp-img" src={`/assets/indigo/${art}.webp`} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}
