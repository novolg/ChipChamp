import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { GameState, Seat as SeatState } from '../../../engine/types';
import { Seat, StackAmount, type ActionBubble } from './Seat';
import { botIdFor, type BotId } from './BotFace';
import { Table } from './Table';
import { blindSeats, isShowdown, winnerNames, winningCardKeys, learnerLevel } from '../../lib/derive';
import { deriveEmotion, chipLeaderProud, handTell, type Emotion } from '../../lib/botEmotion';
import { useGazeDirector, gazeVector } from '../../hooks/useGazeDirector';
import { useCountUp } from '../../hooks/useCountUp';
import { useProgressStore } from '../../store/progressStore';
import { useSettingsStore, prefersReducedMotion } from '../../store/settingsStore';
import { useFitScale } from '../../hooks/useFitScale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BOT_DELAY_MS } from '../../store/gameStore';
import { tableLayout, type LayoutMode, type Pt, type TableLayout } from '../../../scene/layout';
import { resolveTier, type QualityTier } from '../../../scene/quality';
import { PokerScene } from '../../../scene/PokerScene';
import { createDirector, type Channels } from '../../../feel/director';
import { deriveFeelEvents } from '../../../feel/events';
import { playCue } from '../../../audio';
import './tablescene.css';

/* ============================================================================
 * DUPLICATION NOTICE — the seat/emotion/gaze/bubble/emote helpers below are
 * copied largely verbatim from Table.tsx so that Table.tsx (the DOM fallback
 * renderer) stays fully functional and UNMODIFIED. This fallback overlay path
 * is scheduled for deletion after Phase 3, at which point Table.tsx and this
 * duplication both go away.
 * ==========================================================================*/

const POSITIONS = ['left', 'center', 'right'] as const;

/* --- director channel plumbing ------------------------------------------- */

/** Stereo pan per table slot (audio channel). Cues without a slot param pan
 *  nowhere (centered) — panForSlot returns undefined so no panner is inserted. */
const SLOT_PAN: Record<string, number> = { left: -0.5, center: 0, right: 0.5, hero: 0.15 };
const panForSlot = (slot: unknown): number | undefined =>
  typeof slot === 'string' ? SLOT_PAN[slot] : undefined;

/** Haptic patterns (haptic channel), gated on the `haptics` setting. */
const HAPTIC_PATTERNS: Record<string, number[]> = {
  tap: [10],
  heavy: [20, 30, 20],
  success: [10, 40, 10],
};

const ACTION_LABEL: Record<string, string> = {
  fold: 'FOLD', check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE', allin: 'ALL-IN',
};

const EMPTY_WINNERS = new Set<string>();

/* Showdown emotes are rare on purpose: big pots only, at most ONE bot per hand. */
const EMOTE_MIN_POT_BB = 12;
const EMOTE_MIN_HERO_POT_BB = 20;
const EMOTE_SETS: Record<BotId, { win: string[]; grudge: string[] }> = {
  ava: { win: ['🎉', '😄', '💪'], grudge: ['😅'] },
  ben: { win: ['👍', '🙂'], grudge: ['😐'] },
  cleo: { win: ['😏', '😼'], grudge: ['🙄'] },
};

/** Which bot (if any) shows an emote bubble this hand, and which glyph. */
function emoteFor(
  game: GameState,
  winners: Set<string>,
  opponents: SeatState[],
  pot: number,
): { seatId: number; glyph: string } | null {
  if (game.phase !== 'handComplete') return null;
  const glyph = (seat: SeatState, set: string[]) => set[(game.handNumber + seat.id) % set.length];
  const botWinners = opponents.filter((s) => winners.has(s.name));
  if (botWinners.length > 0 && pot >= EMOTE_MIN_POT_BB * game.bigBlind) {
    const seat = botWinners.reduce((a, b) => (b.id < a.id ? b : a));
    return { seatId: seat.id, glyph: glyph(seat, EMOTE_SETS[botIdFor(seat.name)].win) };
  }
  if (winners.has('You') && pot >= EMOTE_MIN_HERO_POT_BB * game.bigBlind) {
    const losers = opponents.filter((s) => !winners.has(s.name) && s.status !== 'folded');
    if (losers.length === 0) return null;
    const seat = losers.reduce((a, b) => (b.committedTotal > a.committedTotal ? b : a));
    return { seatId: seat.id, glyph: glyph(seat, EMOTE_SETS[botIdFor(seat.name)].grudge) };
  }
  return null;
}

/** Each seat's most recent action on the current street, for speech bubbles. */
function actionBubbles(game: GameState): Map<number, ActionBubble> {
  const map = new Map<number, ActionBubble>();
  game.log.forEach((entry, i) => {
    const a = entry.action;
    if (!a || entry.street !== game.street || a.type === 'postBlind') return;
    const amount = a.amount ? ` ${a.amount.toLocaleString()}` : '';
    const tone = a.type === 'fold' ? 'red' : a.type === 'check' || a.type === 'call' ? 'blue' : 'orange';
    map.set(a.seatId, { text: `${ACTION_LABEL[a.type]}${amount}`, tone, seq: i, type: a.type });
  });
  return map;
}

/** Seq that keys BotFace's one-shot entry jolt (see Table.tsx for the rationale). */
function emotionSeqFor(
  emotion: Emotion,
  seat: SeatState,
  bubble: ActionBubble | undefined,
  game: GameState,
): number {
  if (emotion === 'confident') return bubble?.seq ?? 0;
  if (emotion === 'shocked') return seat.status === 'allin' ? 0 : game.log.length;
  return 0;
}

/** Absolute placement centered on a world-coordinate point. `position` is set
 *  inline so widget classes reused from table.css (e.g. .felt-pot's
 *  `position: relative`) can never override it via CSS load order. */
const at = (p: Pt): CSSProperties => ({ position: 'absolute', left: p.x, top: p.y });

interface TableSceneProps {
  game: GameState;
  thinkingSeatId?: number | null;
  children?: ReactNode;
}

/**
 * The DOM overlay: everything the Pixi scene does NOT yet draw (seats, hero,
 * pot capsule, street label, dealer disc, live bet pills, win banner). Split
 * into its own component so its game-derived hooks (gaze director, count-up,
 * progress) never run on the DOM-fallback path. Positioned entirely from
 * layout.ts world coordinates; look is reused from table.css.
 */
function SceneOverlay({
  game,
  thinkingSeatId,
  layout: L,
  mode,
  children,
}: {
  game: GameState;
  thinkingSeatId: number | null | undefined;
  layout: TableLayout;
  mode: LayoutMode;
  children: ReactNode;
}) {
  const { sb, bb } = blindSeats(game);
  const reveal = isShowdown(game);
  const highlight = winningCardKeys(game);
  const pot = game.pots.reduce((sum, p) => sum + p.amount, 0);
  const shownPot = useCountUp(pot);
  const bubbles = actionBubbles(game);

  const hero = game.seats.find((s) => s.isHuman);
  const opponents = game.seats.filter((s) => !s.isHuman);
  const winners = game.phase === 'handComplete' ? winnerNames(game) : EMPTY_WINNERS;
  const emote = emoteFor(game, winners, opponents, pot);
  const gazeMap = useGazeDirector(game);

  const heroLevel = useProgressStore((s) => learnerLevel(s.progress));

  const buttonIdx = opponents.findIndex((s) => s.id === game.buttonSeatId);
  const dealerSlot = hero && hero.id === game.buttonSeatId ? 'hero' : POSITIONS[buttonIdx] ?? 'hero';
  const dealerPt = L.dealer[dealerSlot];

  const blindOf = (id: number): 'SB' | 'BB' | undefined => (id === sb ? 'SB' : id === bb ? 'BB' : undefined);
  const heroBubble = hero ? bubbles.get(hero.id) : undefined;
  const heroActing = hero != null && hero.id === game.toActSeatId && game.phase === 'betting';
  const streetPt: Pt = { x: L.pot.x, y: L.pot.y - (mode === 'portrait' ? 24 : 32) };

  return (
    <>
      {/* Dealer disc: inline transform (not a slot class) so the .dealer-disc
          transform-transition still glides it between button seats. */}
      <span
        className="dealer-disc"
        aria-label="dealer button"
        style={{ transform: `translate(${dealerPt.x - 13}px, ${dealerPt.y - 13}px)` }}
      >
        D
      </span>

      {opponents.slice(0, 3).map((seat, i) => {
        const pos = POSITIONS[i];
        const bubble = bubbles.get(seat.id);
        const base = deriveEmotion(seat, game, thinkingSeatId === seat.id, winners, bubble?.type);
        const gazeState = gazeMap.get(seat.id);
        const emotion: Emotion = gazeState?.expressionOverride ?? base;
        const proud = chipLeaderProud(seat, game);
        const acting = seat.id === game.toActSeatId && game.phase === 'betting';
        const justBet = bubble?.type === 'bet' || bubble?.type === 'raise';
        const tell = acting || justBet ? handTell(seat, game.board) : null;
        const gaze = gazeVector(pos, gazeState?.target ?? 'forward');
        return (
          <div key={`${seat.id}-${game.handNumber}`} className="scene-seat" style={at(L.seats[pos])}>
            <Seat
              seat={seat}
              isToAct={acting}
              revealCards={reveal}
              blindLabel={blindOf(seat.id)}
              highlightKeys={highlight}
              bubble={bubble}
              thinking={thinkingSeatId === seat.id}
              emotion={emotion}
              emotionSeq={emotionSeqFor(emotion, seat, bubble, game)}
              emote={emote && emote.seatId === seat.id ? emote.glyph : undefined}
              gaze={gaze}
              proud={proud}
              tell={tell ?? undefined}
            />
          </div>
        );
      })}

      {/* Bet stacks (live + street sweep) and the pot cluster are drawn by
          the Pixi scene (ChipStackActor) — see PokerScene.fx's betStack /
          sweep / winPush cues. */}

      {/* Board + hero + bot cards are drawn by the Pixi scene (CardActor); the
          overlay keeps only plates, bubbles, pot capsule and banner. */}

      {/* Street label + pot capsule. */}
      <div className="felt-street scene-bet" key={game.street} style={at(streetPt)}>
        {game.street.toUpperCase()}
      </div>
      <div className={`felt-pot scene-bet${pot > 0 ? ' felt-pot-live' : ''}`} style={at(L.potLabel)}>
        <span className="felt-pot-chips" aria-hidden="true">
          <img src="/assets/chip-orange.png" alt="" className="felt-pot-chip felt-pot-chip-0" />
          <img src="/assets/chip-blue.png" alt="" className="felt-pot-chip felt-pot-chip-1" />
        </span>
        <span className="felt-pot-label">TOTAL POT</span>
        <span className="felt-pot-amount">{shownPot.toLocaleString()}</span>
      </div>

      {hero && (
        <div
          className="hero"
          style={{ position: 'absolute', left: L.seats.hero.x, top: L.seats.hero.y, bottom: 'auto', transform: 'translate(-50%, -50%)' }}
        >
          {/* Hero hole cards are drawn by the Pixi scene (CardActor). */}
          <div className={`hero-plate${heroActing ? ' hero-plate-acting' : ''}`}>
            {/* Namespaced key (not the bare number): `heroLevel` starts at 1,
                the same small-integer range as a sibling's `heroBubble.seq`
                key below — an un-namespaced key collided with it. */}
            <span className="seat-level seat-level-hero" key={`level-${heroLevel}`}>{heroLevel}</span>
            <span className="hero-you">YOU</span>
            {blindOf(hero.id) && <span className="badge badge-blind">{blindOf(hero.id)}</span>}
            <span className="hero-stack"><StackAmount value={hero.stack} /></span>
            {heroBubble && (
              <span key={heroBubble.seq} className={`seat-bubble seat-bubble-${heroBubble.tone} hero-bubble`}>
                {heroBubble.text}
              </span>
            )}
          </div>
        </div>
      )}

      {children}
    </>
  );
}

/**
 * Hybrid table renderer. Resolves the quality tier; on 'dom' it renders the
 * existing DOM <Table> unchanged (fallback). Otherwise it mounts a Pixi
 * PokerScene (felt + deck) and layers the DOM overlay on top, both positioned
 * from the same layout.ts world coordinates. StrictMode-safe async mount; a
 * failed init or an unrecoverable WebGL context-loss falls the session back
 * to DOM.
 */
export default function TableScene({ game, thinkingSeatId, children }: TableSceneProps) {
  const settings = useSettingsStore((s) => s.settings);
  const settingRenderer = settings.renderer;
  const reducedMotion = prefersReducedMotion(settings);
  const isMobile = useIsMobile();
  const fitScale = useFitScale();

  const mode: LayoutMode = isMobile ? 'portrait' : 'landscape';
  const L = tableLayout(mode);
  // Timebank-arc drain duration, scaled by speed (threaded to the Seat
  // acting-ring via the --botdelay-ms custom property on both render paths).
  const botDelayStyle = { ['--botdelay-ms']: `${BOT_DELAY_MS / settings.speed}ms` } as CSSProperties;

  // Tier resolved once (the probe creates a throwaway canvas — never per render).
  const [tier, setTier] = useState<QualityTier>(() => resolveTier(settingRenderer));

  // Re-resolve only when the user explicitly changes the renderer setting; this
  // also clears any prior session fallback (they chose a renderer on purpose).
  const prevSetting = useRef(settingRenderer);
  useEffect(() => {
    if (prevSetting.current !== settingRenderer) {
      prevSetting.current = settingRenderer;
      setTier(resolveTier(settingRenderer));
    }
  }, [settingRenderer]);

  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PokerScene | null>(null);

  // Latest values for the async mount callbacks to read (avoids stale closures).
  const modeRef = useRef(mode);
  const fitScaleRef = useRef(fitScale);
  const gameRef = useRef(game);
  const thinkingSeatIdRef = useRef(thinkingSeatId);
  modeRef.current = mode;
  fitScaleRef.current = fitScale;
  gameRef.current = game;
  thinkingSeatIdRef.current = thinkingSeatId;

  // Live settings/tier for the director's getters + channels (created once, so
  // it must read the latest through refs rather than closed-over values).
  const tierRef = useRef(tier);
  const speedRef = useRef(settings.speed);
  const reducedRef = useRef(reducedMotion);
  const hapticsRef = useRef(settings.haptics);
  tierRef.current = tier;
  speedRef.current = settings.speed;
  reducedRef.current = reducedMotion;
  hapticsRef.current = settings.haptics;

  // The feel-director drives ALL table AV (audio/haptic on every path; scene fx
  // only when a Pixi scene is mounted). Created above the tier branch so the
  // DOM fallback keeps its sounds now that useTableSfx is gone.
  const directorRef = useRef<ReturnType<typeof createDirector> | null>(null);
  if (!directorRef.current) {
    const channels: Channels = {
      scene: (cue, params, i) => {
        // DOM tier has no Pixi scene → scene channel is a no-op logger.
        if (tierRef.current === 'dom') return;
        sceneRef.current?.fx(cue, params, i.value);
      },
      audio: (cue, params) => {
        playCue(cue, { pan: panForSlot(params.slot), semitones: params.semitones as number | undefined });
      },
      dom: () => {
        // Phase 1: the only DOM cue (turnSpotlight → .hero-plate-acting) is
        // already state-driven, so this channel is an intentional no-op.
      },
      haptic: (cue) => {
        if (!hapticsRef.current) return;
        navigator.vibrate?.(HAPTIC_PATTERNS[cue] ?? []);
      },
    };
    directorRef.current = createDirector(channels, {
      speed: () => speedRef.current,
      reducedMotion: () => reducedRef.current,
      tier: () => tierRef.current,
    });
  }
  // Cancel any pending director-scheduled steps (audio/haptic) on final
  // unmount, so a hand's in-flight cues (e.g. WIN clinks, ritual cardThump)
  // don't fire after navigating away from the table. Own effect, empty deps,
  // so it never re-runs — only its cleanup on unmount matters.
  useEffect(() => {
    return () => {
      directorRef.current?.cancelAll();
    };
  }, []);

  const prevGameRef = useRef<GameState | null>(null);

  // Uniform scale that fits the world (layout.size) inside whatever box the
  // flex column gives the stage. Recomputed on resize / mode change.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (tier === 'dom') return;
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w > 0 && h > 0) setScale(Math.min(1, w / L.size.w, h / L.size.h));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [tier, L.size.w, L.size.h]);

  // Mount the Pixi scene. StrictMode-safe: a create that resolves after cleanup
  // destroys its orphan; a failed create → session DOM fallback. Also owns the
  // WebGL context-loss recovery (one rebuild attempt, then DOM fallback).
  useEffect(() => {
    if (tier === 'dom') return;
    const host = hostRef.current;
    if (!host) return;
    const activeTier = tier;

    let cancelled = false;
    let current: PokerScene | null = null;
    let currentCanvas: HTMLCanvasElement | null = null;
    let retried = false;

    const teardown = () => {
      if (currentCanvas) currentCanvas.removeEventListener('webglcontextlost', onContextLost);
      current?.destroy();
      if (sceneRef.current === current) sceneRef.current = null;
      current = null;
      currentCanvas = null;
    };

    function onContextLost(e: Event) {
      e.preventDefault(); // ask the browser to keep the canvas restorable
      if (retried) {
        console.warn('[TableScene] WebGL context lost again; falling back to DOM for this session.');
        teardown();
        if (!cancelled) setTier('dom');
        return;
      }
      retried = true;
      console.warn('[TableScene] WebGL context lost; rebuilding the scene once.');
      teardown();
      spawn();
    }

    const spawn = () => {
      PokerScene.create(host, modeRef.current, activeTier)
        .then((scene) => {
          if (cancelled) {
            scene.destroy();
            return;
          }
          current = scene;
          currentCanvas = scene.canvas;
          sceneRef.current = scene;
          currentCanvas.addEventListener('webglcontextlost', onContextLost);
          // Apply the latest frame state (values may have changed during await).
          scene.setMotion(speedRef.current, reducedRef.current);
          scene.setFourColor(useSettingsStore.getState().settings.fourColorDeck);
          scene.resize(fitScaleRef.current);
          scene.setMode(modeRef.current);
          scene.sync(gameRef.current, thinkingSeatIdRef.current);
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn('[TableScene] Pixi scene init failed; falling back to DOM.', err);
          setTier('dom');
        });
    };

    spawn();
    return () => {
      cancelled = true;
      teardown();
    };
  }, [tier]);

  // Every game change: derive feel events off the previous snapshot and let
  // the director dispatch them across channels. Runs on ALL tiers so the DOM
  // fallback still gets audio/haptics.
  useEffect(() => {
    if (!game) return;
    const events = deriveFeelEvents(prevGameRef.current, game);
    prevGameRef.current = game;
    directorRef.current?.dispatch(events, game);
  }, [game]);

  // Settle the scene to truth AFTER dispatch (declared second → runs second on
  // a game change). Also keyed on thinkingSeatId: the bot-think camera framing
  // changes between game snapshots (the store flips the thinker while a bot's
  // delay timer runs), and only sync needs to re-run for it — not dispatch.
  useEffect(() => {
    if (!game) return;
    sceneRef.current?.sync(game, thinkingSeatId);
  }, [game, thinkingSeatId]);

  // Push frame + settings changes to the live scene.
  useEffect(() => {
    sceneRef.current?.resize(fitScale);
  }, [fitScale]);
  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    sceneRef.current?.setMotion(settings.speed, reducedMotion);
  }, [settings.speed, reducedMotion]);
  useEffect(() => {
    sceneRef.current?.setFourColor(settings.fourColorDeck);
  }, [settings.fourColorDeck]);

  // DOM fallback: render the existing table unchanged. A display:contents
  // wrapper carries --botdelay-ms into the (untouched) Seat acting-ring without
  // adding a layout box.
  if (tier === 'dom') {
    return (
      <div style={{ display: 'contents', ...botDelayStyle }}>
        <Table game={game} thinkingSeatId={thinkingSeatId}>
          {children}
        </Table>
      </div>
    );
  }

  return (
    <div className="scene-stage" ref={stageRef}>
      <div
        className="scene-world"
        style={{ width: L.size.w, height: L.size.h, transform: `translate(-50%, -50%) scale(${scale})`, ...botDelayStyle }}
      >
        <div className="scene-canvas" ref={hostRef} aria-hidden="true" />
        <SceneOverlay game={game} thinkingSeatId={thinkingSeatId} layout={L} mode={mode}>
          {children}
        </SceneOverlay>
      </div>
    </div>
  );
}
