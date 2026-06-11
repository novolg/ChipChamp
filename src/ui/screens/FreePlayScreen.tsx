import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';
import { AppFrame } from '../components/AppFrame';
import { Table } from '../components/table/Table';
import { ActionControls } from '../components/controls/ActionControls';
import { CoachingRail } from '../components/coaching/CoachingRail';

export function FreePlayScreen() {
  const game = useGameStore((s) => s.game);
  const botThinking = useGameStore((s) => s.botThinking);
  const newGame = useGameStore((s) => s.newGame);
  const dealHand = useGameStore((s) => s.dealHand);
  const playerAction = useGameStore((s) => s.playerAction);
  const record = useProgressStore((s) => s.record);

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
  const canContinue = game.seats.filter((s) => s.stack > 0).length >= 2;
  const heroBusted = hero ? hero.stack === 0 && !canContinue : false;

  const headerExtra = `BLINDS ${game.smallBlind}/${game.bigBlind} · HAND ${game.handNumber}`;

  return (
    <AppFrame variant="table" active="free" headerExtra={headerExtra}>
      <div className="play-grid">
        <div className="play-main">
          <Table game={game} />

          {handOver && (
            <div className="hand-result">
              {game.log
                .filter((e) => e.note && /wins/.test(e.note))
                .map((e, i) => <span key={i}>{e.note}</span>)}
            </div>
          )}

          <div className="play-controls">
            {heroToAct && hero && (
              <ActionControls game={game} seatId={hero.id} onAction={playerAction} disabled={botThinking} />
            )}
            {!heroToAct && !handOver && (
              <p className="play-wait">{botThinking ? 'Opponent is thinking…' : 'Waiting…'}</p>
            )}
            {handOver && canContinue && (
              <button className="btn btn-blue" onClick={dealHand}>DEAL NEXT HAND</button>
            )}
            {handOver && !canContinue && (
              <div className="game-over">
                <p>{heroBusted ? 'You’re out of chips.' : 'Game over.'}</p>
                <button className="btn btn-blue" onClick={() => newGame()}>NEW GAME</button>
              </div>
            )}
          </div>
        </div>

        <CoachingRail game={game} seatId={hero?.id ?? 0} active={!!heroToAct} />
      </div>
    </AppFrame>
  );
}
