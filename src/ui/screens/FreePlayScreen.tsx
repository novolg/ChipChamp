import { useEffect, useRef, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { Table } from '../components/table/Table';
import { ActionControls } from '../components/controls/ActionControls';
import { CoachingRail } from '../components/coaching/CoachingRail';
import { Confetti } from '../components/Confetti';
import { useCountUp } from '../hooks/useCountUp';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTableSfx, payoutTier } from '../hooks/useTableSfx';
import { canDealNextHand, heroIsBusted } from '../lib/derive';
import { playSfx } from '../lib/sound';
import type { GameState } from '../../engine/types';

type WinSlot = 'hero' | 'left' | 'center' | 'right';

interface WinInfo {
  name: string;
  amount: number;
  hand?: string;
  heroWon: boolean;
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

function winnerSlot(game: GameState, name: string): WinSlot {
  const seat = game.seats.find((s) => (name === 'You' ? s.isHuman : s.name === name));
  if (!seat || seat.isHuman) return 'hero';
  return POSITIONS[game.seats.filter((s) => !s.isHuman).indexOf(seat)] ?? 'hero';
}

/** Parse the engine's "<name> wins <amount> [with <hand>|uncontested]" notes. */
function winInfo(game: GameState): WinInfo | null {
  const wins = game.log
    .map((e) => e.note?.match(/^(.+?) wins (\d+)(?: with (.+))?/))
    .filter((m): m is RegExpMatchArray => m != null);
  if (wins.length === 0) return null;
  const heroWin = wins.find((m) => m[1] === 'You');
  const top = heroWin ?? wins[0];
  return {
    name: top[1],
    amount: wins.filter((m) => m[1] === top[1]).reduce((s, m) => s + Number(m[2]), 0),
    hand: top[3],
    heroWon: Boolean(heroWin),
    slot: winnerSlot(game, top[1]),
  };
}

export function FreePlayScreen() {
  const game = useGameStore((s) => s.game);
  const botThinking = useGameStore((s) => s.botThinking);
  const newGame = useGameStore((s) => s.newGame);
  const dealHand = useGameStore((s) => s.dealHand);
  const playerAction = useGameStore((s) => s.playerAction);
  const record = useProgressStore((s) => s.record);

  const isMobile = useIsMobile();

  // Synthesised table SFX, driven off game-state changes (deals, actions,
  // streets, payout, your-turn). Observational — no effect on gameplay.
  useTableSfx(game);

  // Start a game once on mount (guard against StrictMode double-invoke).
  useEffect(() => {
    if (!useGameStore.getState().game) newGame();
  }, [newGame]);

  // Record each completed hand once, with the hero's net chip change.
  const heroStartStack = useRef<number | null>(null);
  const recordedHand = useRef<number>(-1);
  useEffect(() => {
    if (!game) return;
    const hero = game.seats.find((s) => s.isHuman);
    if (!hero) return;
    if (game.phase === 'betting' && heroStartStack.current === null) {
      heroStartStack.current = hero.stack + hero.committedTotal;
    }
    if (game.phase === 'handComplete' && recordedHand.current !== game.handNumber) {
      const start = heroStartStack.current ?? hero.stack;
      record({ type: 'freePlayHand', netChips: hero.stack - start });
      recordedHand.current = game.handNumber;
      heroStartStack.current = null;
    }
  }, [game, record]);

  // One-shot "you're out" sting when the session ends with the hero busted.
  const bustedRef = useRef(false);
  useEffect(() => {
    if (!game) return;
    const out = game.phase === 'handComplete' && heroIsBusted(game);
    if (out && !bustedRef.current) { bustedRef.current = true; playSfx('lose'); }
    if (!out) bustedRef.current = false;
  }, [game]);

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

  const headerExtra = `BLINDS ${game.smallBlind}/${game.bigBlind} · HAND ${game.handNumber}`;

  return (
    <AppFrame variant="table" active="free" headerExtra={headerExtra}>
      <div className="play-grid">
        <div className="play-main">
          <Table game={game} thinkingSeatId={botThinking ? game.toActSeatId : null}>
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
                    <span className="win-title">{win.heroWon ? 'YOU WIN' : `${win.name.toUpperCase()} WINS`}</span>
                    <img src="/assets/chip-orange.png" alt="" className="win-coin win-coin-r" />
                  </span>
                  <span className="win-amount">+{winAmount.toLocaleString()}</span>
                  {win.hand && <span className="win-hand">{win.hand}</span>}
                </div>
              </div>
            )}
          </Table>

          {isMobile && (
            <CoachingRail game={game} seatId={hero?.id ?? 0} active={!!heroToAct} compact />
          )}

          <div className="play-controls">
            {heroToAct && hero && (
              <ActionControls game={game} seatId={hero.id} onAction={playerAction} disabled={botThinking} />
            )}
            {!heroToAct && !handOver && (
              <p className="play-wait">{botThinking ? 'Opponent is thinking…' : 'Waiting…'}</p>
            )}
            {handOver && canContinue && (
              <button className="btn btn-blue btn-pulse" onClick={dealHand}>DEAL NEXT HAND</button>
            )}
            {handOver && !canContinue && (
              <div className="game-over">
                <p>{heroBusted ? 'You’re out of chips.' : 'Game over.'}</p>
                <button className="btn btn-blue" onClick={() => { playSfx('click'); newGame(); }}>NEW GAME</button>
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
