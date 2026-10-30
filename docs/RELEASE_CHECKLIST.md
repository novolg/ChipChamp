# Release checks

Last local verification: 2026-10-22. No deployment or commit was performed.

## Automated checks

Run from the repository root (Bun works around the broken local Node installation):

```sh
bun node_modules/typescript/bin/tsc -b --noEmit
bun node_modules/vitest/vitest.mjs run
bun node_modules/vite/bin/vite.js build
git diff --check
```

Result after concurrent-save hardening: 382 tests in 42 files pass; typecheck and production build pass.
The initial JS chunk is 364.19 kB (121.77 kB gzip); initial CSS is 91.10 kB
(18.78 kB gzip). The optional Three.js/model chunk remains 572.86 kB
(148.78 kB gzip), which still produces Vite's size warning. Mobile auto mode
now supports models when WebGL2 is available (Pixel follow-up, 2026-10-23);
explicit Reduced/DOM settings remain available. This is not a total-download
budget or a phone benchmark.

## Browser checks

Start each server/browser in a separate terminal, using a dedicated disposable
profile. Never attach these scripts to a personal browser profile. Chrome tests
create and dispose an isolated browser context; Firefox uses a disposable user
context. Stop the processes after testing.

```sh
bun node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort
bun node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5189 --strictPort
```

macOS Chrome launch (choose an unused profile path):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9338 --user-data-dir=/private/tmp/chipchamp-release-chrome --no-first-run --no-default-browser-check --use-angle=swiftshader --enable-unsafe-swiftshader about:blank
```

```sh
bun scripts/browser/release-smoke.mjs
bun scripts/browser/progress-sync-smoke.mjs
bun scripts/browser/keyboard-smoke.mjs
bun scripts/browser/production-smoke.mjs
bun scripts/browser/graphics-loading-smoke.mjs
```

The first script requires the development server: it injects failures and inspects
stores through development modules. The second uses only UI controls against
`dist`, including an intentionally blocked lesson chunk and return-to-club recovery.
Override `CDP_URL` or `APP_URL` for other ports.

Firefox launch (create the empty profile directory first):

```sh
mkdir -p /private/tmp/chipchamp-release-firefox
"/Applications/Firefox.app/Contents/MacOS/firefox" --headless --no-remote --profile /private/tmp/chipchamp-release-firefox --remote-debugging-port 9223
bun scripts/browser/firefox-smoke.mjs
```

Firefox uses native WebDriver BiDi, without geckodriver. Override `BIDI_URL` or
`APP_URL` if necessary. Its suite requires the development server.

Verified Chrome scenarios:

- Missing GLB model uses the portrait; repeated WebGL context loss preserves the hand.
- No WebGL starts a usable DOM table with working actions.
- Interrupted final session write recovers without counting a hand twice.
- A second tab cannot mutate the table; closing the owner transfers the latest hand.
- Completed-hand decision review survives reload.
- Mobile auto mode loads 3D models on WebGL2; 30 rounds do not accumulate canvases.
- Portrait felt plus rail/shadow fits the canvas; regression covers the reported
  Pixel 8A edge clipping. Mobile bot animation is capped at 30 FPS.
- System/app reduced motion retains a still 3D model rather than forcing portraits.
  Settings → Renderer → Avatars reports the actual current fallback/loading state.
- Initial lobby entry does not focus/outline its title; route navigation retains
  heading focus and the keyboard quiz flow.
- Widths 360, 390, 760 and 844 fit; settings reset and Escape restore safe focus.
- Native Tab/Enter quiz completion, feedback → next question → result → club,
  lesson entry focus and Skip to content pass with normal and reduced motion.
  Manual screen-reader speech testing remains outstanding.
- Production lesson, daily puzzle, game, reload and failed route recovery work.
- Blocked graphics chunks fall back to the playable DOM table; a stalled Pixi
  texture request falls back after 12 seconds. Releasing the request later does
  not replace the fallback or change the saved hand. Fold/result still work.

The mobile table became ready in about 5.2 seconds with 4x CPU throttling in
headless desktop emulation. This is a diagnostic observation, not a release SLA.

Firefox checks cover the lobby, DOM gameplay, saved decision review, daily puzzle,
360px layout and persisted reduced-motion preference.

## Remaining release gates

- Safari: automation could not start because Safari's **Allow Remote Automation**
  is disabled. Safari behavior remains unverified; browser settings were not changed.
- Physical iPhone/Android: test touch, rotation, background/resume, audio unlock,
  sustained frame rate, heat and memory during an extended session. Desktop
  emulation cannot establish these results.
- Play through normal and reduced-motion modes visually, including side pots,
  all-in/showdown and audio balance, on the release target browsers.
- Preview the deployed build and check asset/cache behavior before public release.

## Persistence scope

Progress and hands stay in this browser's local storage. The table uses Web Locks
where available (secure contexts, including localhost); browsers without that API
do not gain the single-writer guarantee. The lock covers gameplay, not concurrent
lesson/quiz edits across tabs. A separate `chipchamp-progress` lock now serializes
curriculum, hand receipts, daily completions and resets. Reads happen inside the
lock before writes; failed events remain pending in memory and retry on the next
activity. Resets wait for persistence before reload. Browsers without Web Locks
keep new progress in memory and report it unsaved instead of making unsafe writes.
All already-open tabs must reload after deployment to use the new protocol.
Closing a tab before its queued save completes can lose pending events. The two
localStorage keys used by curriculum and daily results are serialized against
other writers, but not an atomic crash-safe database transaction. There is no
account or cross-device synchronization.
Blocked/full storage is reported in the UI; persistence cannot be guaranteed then.
Daily content rotates through 12 authored exercises. Post-hand coaching reviews
the last hero decision using the beginner advisor, not a solver or every decision.

## Runtime artwork

The five indigo PNG masters are retained. Runtime references use lossless WebP:
7,348,640 bytes → 4,577,890 bytes (37.7% less image payload). This reduces image
transfers, not JavaScript size; retained masters still occupy deployment storage.
Rebuild with `python3 scripts/optimize-indigo.py` (requires `cwebp` and `dwebp`).
The script preserves metadata and verifies exact decoded RGBA equality using only
Python's standard library. Run `bun scripts/browser/art-smoke.mjs` against the
production preview to check browser decoding/compositing too. Chrome's transparent
portrait compositing differs by at most one 8-bit channel step; the opaque saloon
background matches exactly. Production gameplay and route recovery checks pass
with the optimized assets.
