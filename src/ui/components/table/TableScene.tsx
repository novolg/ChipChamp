import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Card, GameState, Seat as SeatState } from '../../../engine/types';
import { Seat, StackAmount, type ActionBubble } from './Seat';
import { PlayingCard } from './Card';
import { Chips } from './Chips';
import { botIdFor, type BotId } from './BotFace';
import { Table } from './Table';
import { blindSeats, isShowdown, winnerNames, winningCardKeys } from '../../lib/derive';
import { deriveEmotion, chipLeaderProud, handTell, type Emotion } from '../../lib/botEmotion';
import { useGazeDirector, gazeVector } from '../../hooks/useGazeDirector';
import { useCountUp } from '../../hooks/useCountUp';
import { useProgressStore } from '../../store/progressStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useFitScale } from '../../hooks/useFitScale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { LEARNING_PATH } from '../../../tutorial/content/learningPath';
import { QUIZZES_BY_ID } from '../../../tutorial/content/quizzes';
import { isStepComplete } from '../../../tutorial/progress/progressReducer';
import { tableLayout, type LayoutMode, type Pt, type TableLayout } from '../../../scene/layout';
import { resolveTier, type QualityTier } from '../../../scene/quality';
import { PokerScene } from '../../../scene/PokerScene';
import './tablescene.css';

/* ============================================================================
 * DUPLICATION NOTICE — the seat/emotion/gaze/bubble/emote helpers below are
 * copied largely verbatim from Table.tsx so that Table.tsx (the DOM fallback
 * renderer) stays fully functional and UNMODIFIED. This fallback overlay path
 * is scheduled for deletion after Phase 3, at which point Table.tsx and this
 * duplication both go away.
 * ==========================================================================*/

const key = (c: Card) => `${c.rank}${c.suit}`;
const POSITIONS = ['left', 'center', 'right'] as const;

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

/** Absolute placement centered on a world-coordinate point. */
const at = (p: Pt): CSSProperties => ({ left: p.x, top: p.y });

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

  const done = useProgressStore(
    (s) => LEARNING_PATH.filter((step) => isStepComplete(step, s.progress, QUIZZES_BY_ID)).length,
  );

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

      {/* Live bet pills between each seat and the pot. */}
      {game.phase === 'betting' &&
        opponents.slice(0, 3).map((s, i) =>
          s.committedThisStreet > 0 ? (
            <div key={s.id} className="scene-bet" style={at(L.bets[POSITIONS[i]])}>
              <Chips amount={s.committedThisStreet} tone={s.id === game.toActSeatId ? 'orange' : 'blue'} />
            </div>
          ) : null,
        )}
      {game.phase === 'betting' && hero && hero.committedThisStreet > 0 && (
        <div className="scene-bet" style={at(L.bets.hero)}>
          <Chips amount={hero.committedThisStreet} tone="blue" />
        </div>
      )}

      {/* Street label + pot capsule (board cards are removed on the scene path). */}
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
          <div className="hero-cards" key={game.handNumber}>
            {hero.holeCards.length === 2 ? (
              hero.holeCards.map((c, i) => (
                <PlayingCard key={i} card={c} size="hero" highlight={highlight.has(key(c))} />
              ))
            ) : (
              <>
                <div className="pcard pcard-hero pcard-empty" />
                <div className="pcard pcard-hero pcard-empty" />
              </>
            )}
          </div>
          <div className={`hero-plate${heroActing ? ' hero-plate-acting' : ''}`}>
            <span className="seat-level seat-level-hero" key={done}>{done + 1}</span>
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
  const settingRenderer = useSettingsStore((s) => s.settings.renderer);
  const isMobile = useIsMobile();
  const fitScale = useFitScale();

  const mode: LayoutMode = isMobile ? 'portrait' : 'landscape';
  const L = tableLayout(mode);

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
  modeRef.current = mode;
  fitScaleRef.current = fitScale;
  gameRef.current = game;

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
          scene.resize(fitScaleRef.current);
          scene.setMode(modeRef.current);
          scene.sync(gameRef.current);
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

  // Push frame changes to the live scene.
  useEffect(() => {
    sceneRef.current?.sync(game);
  }, [game]);
  useEffect(() => {
    sceneRef.current?.resize(fitScale);
  }, [fitScale]);
  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  // DOM fallback: render the existing table unchanged and stop.
  if (tier === 'dom') {
    return (
      <Table game={game} thinkingSeatId={thinkingSeatId}>
        {children}
      </Table>
    );
  }

  return (
    <div className="scene-stage" ref={stageRef}>
      <div
        className="scene-world"
        style={{ width: L.size.w, height: L.size.h, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <div className="scene-canvas" ref={hostRef} aria-hidden="true" />
        <SceneOverlay game={game} thinkingSeatId={thinkingSeatId} layout={L} mode={mode}>
          {children}
        </SceneOverlay>
      </div>
    </div>
  );
}
