# ChipChamp

A browser app that teaches **Texas Hold'em** to beginners and lets them practice single-player against rule-based AI bots, with a live coaching rail (hand strength, pot odds, suggested action). No real money, no backend — everything runs client-side; progress is saved in `localStorage`.

## Stack

React + TypeScript + Vite · Zustand (state) · Vitest (tests).

The poker logic lives in a pure, headless, fully-tested engine (`src/engine/`); the bot, the coaching advisor, and scripted tutorial hands are thin consumers of it.

## Commands

```bash
npm install      # install dependencies
npm run dev      # start dev server (http://localhost:5173)
npm run test     # run unit tests once
npm run test:watch
npm run build    # typecheck + production build
```

## Environment

No environment variables are required (fully client-side). See `.env.example`.

## Layout

- `src/engine/` — pure poker logic: evaluator, deck, betting state machine, pots, showdown.
- `src/bot/` — opponent decision policy.
- `src/advisor/` — real-time coaching advice.
- `src/tutorial/` — lessons, scripted practice hands, quizzes, progress.
- `src/ui/` — React components, screens, theme, Zustand stores.
