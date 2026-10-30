import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { showdownSteps, type StagedStep } from '../lib/showdownStage';

/**
 * Presents `game`, except right after a contested showdown: then it walks the
 * staged snapshots from `showdownSteps` (scaled by `speed`) before handing
 * over the final state. Steps are derived during render (not in an effect) so
 * the final state never reaches the table — and its feel-director — first.
 */
export function useShowdownStaging(game: GameState | null, speed: number): GameState | null {
  // Previous distinct snapshot. Idempotent per `game`, so StrictMode's double
  // render cannot turn prev into the current game.
  const hist = useRef<{ last: GameState | null; prev: GameState | null }>({ last: null, prev: null });
  const steps = useMemo<StagedStep[]>(() => {
    if (game !== hist.current.last) {
      hist.current.prev = hist.current.last;
      hist.current.last = game;
    }
    const prev = hist.current.prev;
    return game && prev ? showdownSteps(prev, game) : [];
  }, [game]);

  const [pos, setPos] = useState<{ steps: StagedStep[]; i: number } | null>(null);
  const i = pos && pos.steps === steps ? pos.i : 0;

  useEffect(() => {
    if (i >= steps.length) return;
    const t = setTimeout(() => setPos({ steps, i: i + 1 }), steps[i].holdMs / speed);
    return () => clearTimeout(t);
  }, [steps, i, speed]);

  return i < steps.length ? steps[i].game : game;
}
