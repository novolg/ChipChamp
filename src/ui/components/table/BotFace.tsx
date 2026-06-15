import type { CSSProperties } from 'react';
import type { Emotion } from '../../lib/botEmotion';
import type { GazeVec } from '../../hooks/useGazeDirector';
import type { HandTell } from '../../lib/botEmotion';
import './botface.css';

export type { Emotion } from '../../lib/botEmotion';

export type BotId = 'ava' | 'ben' | 'cleo';

/** Map a bot's name to its face skin (same logic as the old avatarFor); Ben is the fallback. */
export function botIdFor(name: string): BotId {
  const n = name.toLowerCase();
  if (n.includes('ava')) return 'ava';
  if (n.includes('cleo')) return 'cleo';
  return 'ben';
}

type EyeStyle = 'arc' | 'round' | 'slit';

/** Signature base eye per bot, matching the reference PNGs. */
const SKINS: Record<BotId, { eye: EyeStyle }> = {
  ava: { eye: 'arc' },
  ben: { eye: 'round' },
  cleo: { eye: 'slit' },
};

interface Persona {
  blinkDur: string;
  bobDur: string;
  bobAmp: string;
  bobTilt: string;
  ease: string;
  poseMs: number;
}

/** Timing personality: Ava quick and bouncy, Ben slow and steady, Cleo languid and sly.
 *  Coprime-ish durations keep the three bots permanently desynced without randomness. */
const PERSONA: Record<BotId, Persona> = {
  ava: {
    blinkDur: '3.9s',
    bobDur: '2.6s',
    bobAmp: '1.6px',
    bobTilt: '0deg',
    ease: 'cubic-bezier(0.34, 1.8, 0.5, 1)',
    poseMs: 220,
  },
  ben: {
    blinkDur: '5.3s',
    bobDur: '4.2s',
    bobAmp: '1px',
    bobTilt: '0deg',
    ease: 'cubic-bezier(0.25, 1.1, 0.4, 1)',
    poseMs: 340,
  },
  cleo: {
    blinkDur: '6.7s',
    bobDur: '3.4s',
    bobAmp: '1.2px',
    bobTilt: '1deg',
    ease: 'cubic-bezier(0.3, 1.3, 0.45, 1)',
    poseMs: 300,
  },
};

/** One eye group: signature base + emotion variants cross-faded by opacity.
 *  Coordinates are baked per eye (no transform attr) so CSS blink/pose
 *  transforms never clobber the eye's position. */
function Eye({ skin, cx }: { skin: EyeStyle; cx: number }) {
  return (
    <g className="bf-eye">
      {skin === 'arc' ? (
        <path
          className="bf-eye-base"
          d={`M${cx - 4} 34 Q${cx} 28.5 ${cx + 4} 34`}
          stroke="var(--bot-eye)"
          strokeWidth="3.2"
          fill="none"
          strokeLinecap="round"
        />
      ) : skin === 'slit' ? (
        <rect
          className="bf-eye-base"
          x={cx - 4}
          y="30.3"
          width="8"
          height="3.4"
          rx="1.7"
          fill="var(--bot-eye)"
        />
      ) : (
        <circle className="bf-eye-base" cx={cx} cy="32" r="4.2" fill="var(--bot-eye)" />
      )}
      <circle className="bf-eye-wide" cx={cx} cy="32" r="5.2" fill="var(--bot-eye)" opacity="0" />
      <path
        className="bf-eye-happy"
        d={`M${cx - 4} 34 Q${cx} 28.5 ${cx + 4} 34`}
        stroke="var(--bot-eye)"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        opacity="0"
      />
      <path
        className="bf-eye-sad"
        d={`M${cx - 4} 30.5 Q${cx} 35.5 ${cx + 4} 30.5`}
        stroke="var(--bot-eye)"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        opacity="0"
      />
    </g>
  );
}

interface BotFaceProps {
  bot: BotId;
  emotion: Emotion;
  seatId: number;
  name: string;
  /** Bump to replay the current emotion's entry jolt (keyed .bf-pose remount). */
  emotionSeq: number;
  /** Resolved gaze offset (Table owns the slot→vector lookup). */
  gaze?: GazeVec;
  /** Smug chip-leader modifier. */
  proud?: boolean;
  /** Faint strength tell, only while acting. */
  tell?: HandTell;
}

/** Inline-SVG robot face: an animatable recreation of the bot PNG avatars.
 *  All motion is driven by CSS classes (.bf--{emotion}) in botface.css. */
export function BotFace({ bot, emotion, seatId, name, emotionSeq, gaze, proud, tell }: BotFaceProps) {
  const persona = PERSONA[bot];
  // Deterministic per-seat phase offsets — no Math.random, replay-stable.
  const vars = {
    '--bf-blink-dur': persona.blinkDur,
    '--bf-blink-delay': `${(seatId * 1.7) % 4}s`,
    '--bf-bob-dur': persona.bobDur,
    '--bf-bob-amp': persona.bobAmp,
    '--bf-bob-tilt': persona.bobTilt,
    '--bf-ease': persona.ease,
    '--bf-pose-ms': `${persona.poseMs}ms`,
    '--bf-gaze-x': `${gaze?.x ?? 0}px`,
    '--bf-gaze-y': `${gaze?.y ?? 0}px`,
    '--bf-gaze-tilt': `${gaze?.tilt ?? 0}deg`,
  } as CSSProperties;

  const cls =
    `botface bf-${bot} bf--${emotion}` +
    (proud ? ' bf--proud' : '') +
    (tell ? ` bf--tell-${tell}` : '');

  return (
    <svg
      viewBox="0 0 64 64"
      className={cls}
      role="img"
      aria-label={`${name} — ${emotion}`}
      style={vars}
    >
      <defs>
        <linearGradient id={`bfg-${bot}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`var(--bot-${bot}-hi)`} />
          <stop offset="100%" stopColor={`var(--bot-${bot}-body)`} />
        </linearGradient>
      </defs>

      <circle
        className="bf-body"
        cx="32"
        cy="32"
        r="30"
        fill={`url(#bfg-${bot})`}
        stroke={`var(--bot-${bot}-rim)`}
        strokeWidth="2.5"
      />

      {/* Antenna renders before the head so the faceplate overlaps the stem. */}
      <g className="bf-antenna">
        <rect x="30.2" y="9" width="3.6" height="13" rx="1.8" fill="var(--bot-plate)" />
        <circle className="bf-tip-glow" cx="32" cy="9.5" r="7.5" fill="var(--c-orange-hi)" opacity="0" />
        <circle
          className="bf-tip"
          cx="32"
          cy="9.5"
          r="4.4"
          fill="var(--c-orange-hi)"
          stroke="var(--bot-plate)"
          strokeWidth="2"
        />
      </g>

      {/* Idle bob lives on .bf-head; held pose transforms live on .bf-pose so
          they compose. The key remounts only the pose group, replaying entry
          keyframes without touching body/antenna/blink phase. */}
      <g className="bf-head">
        {/* Gaze head-tilt rides here so it composes with the idle bob (parent)
            and the held emotion pose (child) instead of clobbering either. */}
        <g className="bf-headtilt">
          <g className="bf-pose" key={`${emotion}-${emotionSeq}`}>
            <rect className="bf-plate" x="13" y="20" width="38" height="30" rx="11" fill="var(--bot-plate)" />
            <rect x="16" y="23" width="32" height="7" rx="3.5" fill="#fff" opacity="0.04" />
            {/* Suspicious brow: hidden by default; tilts about its centre. */}
            <path
              className="bf-brow"
              d="M21 26 L43 26"
              stroke="var(--bot-eye)"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
              opacity="0"
            />
            {/* Eye gaze translate rides on .bf-gaze so emotion transforms on
                .bf-eyes (thinking/confident/worried/asleep) still compose. */}
            <g className="bf-gaze">
              <g className="bf-eyes">
                <Eye skin={SKINS[bot].eye} cx={24.5} />
                <Eye skin={SKINS[bot].eye} cx={39.5} />
              </g>
            </g>
            <g className="bf-mouth">
              <circle className="bf-dot" cx="26.5" cy="43.5" r="1.8" fill="var(--bot-eye)" opacity="0.5" />
              <circle className="bf-dot" cx="32" cy="43.5" r="1.8" fill="var(--bot-eye)" opacity="0.5" />
              <circle className="bf-dot" cx="37.5" cy="43.5" r="1.8" fill="var(--bot-eye)" opacity="0.5" />
              <path
                className="bf-mouth-smile"
                d="M26 42.5 Q32 47.5 38 42.5"
                stroke="var(--bot-eye)"
                strokeWidth="2.6"
                fill="none"
                strokeLinecap="round"
                opacity="0"
              />
              <path
                className="bf-mouth-frown"
                d="M26 45.5 Q32 41 38 45.5"
                stroke="var(--bot-eye)"
                strokeWidth="2.6"
                fill="none"
                strokeLinecap="round"
                opacity="0"
              />
              <circle
                className="bf-mouth-o"
                cx="32"
                cy="43.5"
                r="3"
                stroke="var(--bot-eye)"
                strokeWidth="2.4"
                fill="none"
                opacity="0"
              />
            </g>
            <path
              className="bf-sweat"
              d="M47 21 q3.4 4.4 0 6.6 q-3.4 -2.2 0 -6.6"
              fill="var(--bot-eye)"
              opacity="0"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
