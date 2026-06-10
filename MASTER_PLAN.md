# Master Plan — Poker Tutor

> Last updated: 2026-06-10

## Project Overview
Browser app that teaches Texas Hold'em to beginners and lets them practice single-player vs rule-based AI bots, with a live coaching rail. No real money, no backend — fully client-side; progress in `localStorage`. Stack: React + TypeScript + Vite, Zustand, Vitest. A pure headless poker engine is the keystone; bot, advisor, and scripted tutorial hands all consume it so behavior is identical across free play and tutorials.

## File Map
- `src/engine/` — pure poker logic. `types.ts` `rng.ts` `deck.ts` `evaluator.ts` `strength.ts` `betting.ts` `pots.ts` `reducer.ts` `index.ts` + `__tests__/`
- `src/bot/` — `policy.ts` (`decide`), `botConstants.ts`
- `src/advisor/` — `advisor.ts` (`advise`)
- `src/tutorial/` — `content/{lessons,scriptedHands,quizzes,learningPath}.ts`, `progress/{storage,progressReducer}.ts`, `types.ts`
- `src/ui/` — `main.tsx` `App.tsx`, `store/{gameStore,progressStore}.ts`, `components/{table,controls,coaching}/`, `screens/`, `theme/`
- Config: `package.json` `vite.config.ts` `tsconfig*.json` `index.html`
- Plan of record: `/Users/admin/.claude/plans/concurrent-crafting-ember.md`

## Done
- [2026-06-10] Brainstormed scope and architecture; wrote + approved implementation plan.
- [2026-06-10] Phase 0 scaffold: package.json, tsconfig (project refs), vite+vitest config, index.html, theme tokens/global CSS, .gitignore, .env(.example), README, this file. Deps installed (network requires sandbox-off).
- [2026-06-10] Phases 1–4 engine (TDD): types, seeded RNG, deck + stacked deck, hand evaluator (21-combo), betting state machine (reducer, min-raise, short-all-in-no-reopen), side pots + showdown. **Milestone A** — headless full hands to showdown.
- [2026-06-10] Phase 5 bot (Chen preflop, strength+pot-odds postflop, bluff) + `engine/strength.ts` shared helpers; legality fuzz (25 seeds × 20 hands, 0 illegal). Phase 6 advisor (equity/pot-odds reasoning). **Milestone B** — full non-UI brain tested (56 tests).
- [2026-06-10] Phases 7–8 UI: Zustand `gameStore` with timer-driven bot orchestration, table/seat/card/chips/board components, action controls, coaching rail (right side) wired to advisor. Flat/minimal theme CSS. **Milestone C** — dev server boots (HTTP 200), full hands play with chips conserved across button rotation.
- [2026-06-10] Phase 9 — tutorial types, pure `progressReducer` + localStorage adapter (corrupt/version/quota safe, injectable for tests), content (4 lessons, 2 quizzes, 2 scripted hands, 9-step learning path). `progressStore`.
- [2026-06-10] Phase 10 — nav store + screens: LearningPathHome (lock/complete gating), Lesson (markdown + hand-rank table + card examples), Quiz (score/pass/explanations), PracticeHand runner (`tutorial/practice.ts` — reuses engine via stacked deck + checkpoint validation). Free play records completed hands. **Milestone D** — full path navigable; all routes serve 200.
- [2026-06-10] Phase 11 — showdown result banner (named winners + hand), end-to-end 3-way all-in side-pot test, localStorage hardening. **75 tests pass, typecheck clean, production build clean.**

## In Progress
- (none — all 11 phases complete)

## Next
1. `xcode-select --install` then `git init` + first commit (git unavailable in build env).
2. Optional enhancements: postflop scripted practice hands (queue support already in `ScriptedHand.setup.scriptedBotActions`); difficulty selector in free play (presets exist in `bot/botConstants.ts`); per-pot side-pot display labels; ESLint `no-restricted-imports` rule to enforce "no React/Math.random in engine".

## Architecture Decisions
- **Decision:** No backend; single-player vs bots; all client-side. **Reason:** Tutorial/practice tool for beginners — networking adds large scope with no learning benefit. **Rejected alternative:** Multiplayer server (auth, matchmaking, realtime) — premature.
- **Decision:** Pure headless engine with injected seeded RNG; bot/advisor/tutorial consume it. **Reason:** Determinism enables unit testing and reproducible scripted hands; one source of truth for rules. **Rejected alternative:** Logic embedded in React components — untestable, divergent behavior.
- **Decision:** Hand evaluator by 21-combo enumeration + categorical scoring (not lookup tables). **Reason:** Clarity in a teaching codebase; ≤9 hands/showdown so speed is irrelevant; yields exact winning 5 cards for UI highlight. **Rejected alternative:** Cactus-Kev / 2+2 lookup — fast but opaque.
- **Decision:** React DOM + CSS rendering, modern-flat theme, right-side coaching rail. **Reason:** Accessibility, easy coaching overlays, "learning tool not casino" feel. **Rejected alternative:** Canvas/PixiJS — heavier, worse a11y.
- **Decision:** Rule-based bots (Chen preflop, hand-strength+pot-odds postflop, light bluff). **Reason:** Tunable, fast, good enough to teach beginners. **Rejected alternative:** Monte Carlo equity — overkill.
- **Decision:** Integer chips only. **Reason:** Avoid float drift in pots/splits.

## Known Issues & Gotchas
- git unavailable in this environment (xcode-select error). Run `xcode-select --install` then `git init` to start version control.
- Engine gotchas to test explicitly: ace-low straight (wheel); min-raise + short all-in must not reopen action; side pots with folded contributors; split-pot odd chip (deterministic rule); all-in board run-out; "best 5 of 7" when board plays; no `Math.random()` in non-UI modules; clamp bot actions via `getLegalActions`; localStorage corrupt/quota fallback; "next to act" must skip folded/all-in/out seats.
