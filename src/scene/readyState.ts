/**
 * Pixi-free "scene assets are ready" flag, consumed by the branded splash gate
 * in `AppFrame.tsx`. `assets.ts` top-level-imports `pixi.js`, so a static
 * import of it from AppFrame — which renders on every screen, including
 * Learn — would pull all of Pixi into the app's main chunk and blow the lazy
 * chunk budget (the lazy boundary is `React.lazy(TableScene)` in
 * `FreePlayScreen.tsx`; Learn/main must never load Pixi). This module has no
 * dependency on Pixi (or anything else) so it's safe to import unconditionally.
 *
 * `markReady()` is called from `assets.ts`'s `createAssets()`, which only
 * ever runs from already-lazy scene code — so the mutation site never taints
 * this module's bundle membership.
 *
 * Shape matches `useSyncExternalStore(subscribe, isReady)`.
 */

type Listener = () => void;

let ready = false;
const listeners = new Set<Listener>();

/** Snapshot getter: true once the first scene asset load has resolved. */
export function isReady(): boolean {
  return ready;
}

/** Subscribe to ready-state changes; returns an unsubscribe function. */
export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Marks assets ready and notifies subscribers. Idempotent — safe to call on
 *  every `createAssets()` resolution (e.g. re-entering the Play screen). */
export function markReady(): void {
  if (ready) return;
  ready = true;
  for (const cb of listeners) cb();
}

/** Test-only: resets module state between test cases. */
export function __resetReadyStateForTests(): void {
  ready = false;
  listeners.clear();
}
