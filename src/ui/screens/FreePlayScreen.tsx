import { useEffect, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { AppFrame } from '../components/AppFrame';
import { ActionControls } from '../components/controls/ActionControls';
import { CoachingRail } from '../components/coaching/CoachingRail';
import { Confetti } from '../components/Confetti';
import { useCountUp } from '../hooks/useCountUp';
import { useIsMobile } from '../hooks/useIsMobile';
import { payoutTier } from '../../feel/intensity';
import { canDealNextHand, heroIsBusted } from '../lib/derive';
import { describeHand, featuredWinner, isSplitPot } from '../lib/result';
import { useShowdownStaging } from '../hooks/useShowdownStaging';
import { useSettingsStore } from '../store/settingsStore';
import { playSfx } from '../lib/sound';
import type { GameState } from '../../engine/types';

import { ResilientTable } from '../components/table/ResilientTable';
import { TableReadout, PotBreakdown } from '../components/table/TableReadout';

type WinSlot = 'hero' | 'left' | 'center' | 'right';

interface WinInfo {
  name: string;
  amount: number;
  hand?: string;
  heroWon: boolean;
  /** Main pot shared by 2+ winners. */
  split: boolean;
  /** Table slot the chips fly to (mirrors Table.tsx's seat order). */
  slot: WinSlot;
}

/** Same seat→slot order as Table.tsx, so particles target the right plate. */
const POSITIONS = ['left', 'center', 'right'] as const;

/** Flight vector (px) from the pot centre to each slot's plate. */
const FLY: Record<WinSlot, [number, number]> = {
  hero: [0, 250],
  left: [-300, -125],
  center: [0, -175],
  right: [300, -125],
};

/** Mobile flight vectors — shorter throws toward the portrait-layout plates. */
const FLY_MOBILE: Record<WinSlot, [number, number]> = {
  hero: [0, 170],
  left: [-110, -150],
  center: [0, -190],
  right: [110, -150],
};

function winnerSlot(game: GameState, seat: GameState['seats'][number]): WinSlot {
  if (seat.isHuman) return 'hero';
  return POSITIONS[game.seats.filter((s) => !s.isHuman).indexOf(seat)] ?? 'hero';
}

/** Banner data from the engine's structured result (hero featured if they won any share). */
function winInfo(game: GameState): WinInfo | null {
  const w = featuredWinner(game);
  if (!w || !game.result) return null;
  const seat = game.seats.find((s) => s.id === w.seatId)!;
  const shown = game.result.shown.find((h) => h.seatId === w.seatId);
  return {
    name: seat.isHuman ? 'You' : seat.name,
    amount: w.amount,
    hand: shown ? describeHand(shown.rank) : undefined,
    heroWon: seat.isHuman,
    split: isSplitPot(game.result),
    slot: winnerSlot(game, seat),
  };
}

export function FreePlayScreen() {
  // `live` is the engine state; `game` is what the table shows — the same,
  // except a contested showdown is replayed step by step (useShowdownStaging).
  const live = useGameStore((s) => s.game);
  const speed = useSettingsStore((s) => s.settings.speed);
  const game = useShowdownStaging(live, speed);
  const botThinking = useGameStore((s) => s.botThinking);
  const newGame = useGameStore((s) => s.newGame);
  const dealHand = useGameStore((s) => s.dealHand);
  const playerAction = useGameStore((s) => s.playerAction);
  const sessionSaved = useGameStore((s) => s.sessionSaved);
  const hasTableControl = useGameStore((s) => s.hasTableControl);

  const isMobile = useIsMobile();

  // Table AV (deals, actions, streets, payout, your-turn) is now driven by the
  // feel-director inside TableScene — no separate SFX hook here.

  // Start a game once on mount (guard against StrictMode double-invoke).
  useEffect(() => {
    if (!useGameStore.getState().game) newGame();
  }, [newGame, hasTableControl]);

  // A table pauses while in the lobby, lessons or a hidden browser tab.
  useEffect(() => {
    const update = () => document.hidden ? useGameStore.getState().pause() : useGameStore.getState().resume();
    update();
    document.addEventListener('visibilitychange', update);
    return () => { document.removeEventListener('visibilitychange', update); useGameStore.getState().pause(); };
  }, [hasTableControl]);

  // The hero-bust "you're out" sting is now emitted by the feel-director's
  // HERO_BUST recipe (see TableScene), so no separate one-shot is needed here.

  // Derived before the early return so the hook order stays stable; the
  // banner amount rolls up like a slot payout instead of snapping.
  const win = game && game.phase === 'handComplete' ? winInfo(game) : null;
  const winAmount = useCountUp(win?.amount ?? 0, 800);

  if (!game) {
    return (
      <AppFrame variant="table" active="free">
        <div className="play-loading">Loading…</div>
      </AppFrame>
    );
  }

  const hero = game.seats.find((s) => s.isHuman);
  const heroToAct = hero && game.toActSeatId === hero.id && game.phase === 'betting';
  const handOver = game.phase === 'handComplete';
  // Single-player: the session ends when the hero is out of chips, even if the
  // bots could keep playing. Dealing a chip-less hero seats them 'out' with no
  // hole cards (placeholder cards on the felt) — the bug this guards against.
  const canContinue = canDealNextHand(game);
  const heroBusted = heroIsBusted(game);

  // Reward magnitude — drives confetti density and the ray-burst gate so a
  // monster pot reads bigger than a folded blind. (Audio scales in useTableSfx.)
  const winTier = win?.heroWon ? payoutTier(win.amount, game.bigBlind) : 'small';
  const CONFETTI: Record<string, number> = { small: 16, medium: 28, big: 38, monster: 56 };

  const fly = isMobile ? FLY_MOBILE : FLY;

  const headerExtra = `BLINDS ${game.smallBlind}/${game.bigBlind} · HAND ${game.handNumber}${sessionSaved ? "" : " · SESSION NOT SAVED"}`;

  return (
    <AppFrame variant="table" active="free" headerExtra={headerExtra}>
      <div className="play-grid">
        <div className="play-main">
          <TableReadout game={game} />
          <ResilientTable game={game} thinkingSeatId={botThinking ? game.toActSeatId : null}>
            {win && (
              <div className="win-overlay" key={game.handNumber}>
                {win.heroWon && <Confetti count={CONFETTI[winTier]} />}
                {/* Slot-machine gold ray-burst — reserved for medium+ pots so
                    it reads as a bigger moment than a routine fold-out win. */}
                {win.heroWon && winTier !== 'small' && (
                  <div className="win-burst" aria-hidden="true">
                    <i className="win-burst-rays" />
                  </div>
                )}
                {/* Chip particles arc from the pot to the winner's plate.
                    Deterministic jitter ((i*53)%44 etc) avoids render churn. */}
                {Array.from({ length: 9 }, (_, i) => (
                  <img
                    key={i}
                    src={i % 2 ? '/assets/chip-blue.png' : '/assets/chip-orange.png'}
                    alt=""
                    className="chip-fly"
                    style={{
                      '--d': `${0.15 + i * 0.045}s`,
                      '--fx': `${fly[win.slot][0] + ((i * 53) % 44) - 22}px`,
                      '--fy': `${fly[win.slot][1] + ((i * 37) % 28) - 14}px`,
                    } as CSSProperties}
                  />
                ))}
                <div className={`win-banner${win.heroWon ? ' win-banner-hero' : ''}`}>
                  <span className="win-title-row">
                    <img src="/assets/chip-orange.png" alt="" className="win-coin win-coin-l" />
                    <span className="win-title">{win.split ? 'SPLIT POT' : win.heroWon ? 'YOU WIN' : `${win.name.toUpperCase()} WINS`}</span>
                    <img src="/assets/chip-orange.png" alt="" className="win-coin win-coin-r" />
                  </span>
                  <span className="win-amount">+{winAmount.toLocaleString()}</span>
                  {win.hand && <span className="win-hand">{win.hand}</span>}
                </div>
              </div>
            )}
          </ResilientTable>

          {isMobile && (
            <CoachingRail game={game} seatId={hero?.id ?? 0} active={!!heroToAct} compact />
          )}

          <div className="play-controls">
            <PotBreakdown game={game} />
            {heroToAct && hero && (
              <ActionControls game={game} seatId={hero.id} onAction={playerAction} disabled={botThinking} silentPress />
            )}
            {!heroToAct && !handOver && (
              <p className="play-wait">{botThinking ? 'Opponent is thinking…' : 'Waiting…'}</p>
            )}
            {handOver && canContinue && (
              <button className="btn btn-orange btn-pulse" onClick={dealHand}>DEAL NEXT HAND</button>
            )}
            {handOver && !canContinue && (
              <div className="game-over">
                <p>{heroBusted ? 'You’re out of chips.' : 'Game over.'}</p>
                <button className="btn btn-orange" onClick={() => { playSfx('click'); newGame(); }}>NEW GAME</button>
              </div>
            )}
          </div>
        </div>

        {!isMobile && (
          <CoachingRail game={game} seatId={hero?.id ?? 0} active={!!heroToAct} />
        )}
      </div>
    </AppFrame>
  );
}
