# Odogwu Empire

> **Buy the land. Become the Odogwu.**

A pan-Nigerian, real-time **online multiplayer** property-trading board game — built
on an authoritative server with a pure, fully-tested game engine. Buy properties from
Maiduguri to Ikoyi, charge rent in Naira, draw Pidgin-flavoured Chance / Hustle cards,
and bankrupt your rivals.

[![CI](https://github.com/foodiezy/naija-poly/actions/workflows/ci.yml/badge.svg)](https://github.com/foodiezy/naija-poly/actions/workflows/ci.yml)
&nbsp;·&nbsp; **▶ Play the live demo: https://odogwu-empire-server.onrender.com**

> ⏳ The demo is hosted on a free tier that sleeps when idle — the first load after a
> while can take **~30–60s to wake up**, then it's instant. Open it in two tabs (or share
> the `?room=CODE` invite link) to play multiplayer.

---

## Highlights

- **Authoritative server, not trust-the-client.** The server owns the true game state;
  clients send *intent* (`ROLL`, `BUY`, `BID`…) and receive state updates. Money, rent,
  and ownership are **never** computed on the client — you can't cheat by tampering with
  the browser.
- **A pure, deterministic game engine.** All rules live in one place:
  `applyAction(state, playerId, action) => newState` — no mutation, no I/O, randomness
  only via an injected RNG. That purity is what makes the whole rulebook exhaustively
  testable headless.
- **169 passing tests**, including a full 2-player game simulated end-to-end
  (roll → rent → building → auctions → bankruptcy → winner). Strict TypeScript, no `any`.
- **Real-time multiplayer** over Colyseus/WebSockets: lobbies, invite links, AI bots,
  turn & auction timers, room-lock on start, and **60s reconnection grace** so a dropped
  player rejoins their game.
- **Built with a security mindset:** `NODE_ENV`-gated dev tooling (dev panel stripped from
  production builds), pinned CORS origins, per-client rate limiting, an uncircumventable
  **server-side chat profanity filter**, and **redacted state sync** (the card deck order
  is never sent to clients, so it can't be read ahead).
- **Data-driven board.** Layout, prices, rent tables, and card decks are plain data in
  `src/data/board.ts` — you retheme (new cities, a whole new edition) by editing data, not
  logic.

## Architecture

An **authoritative server** holds the single source of truth for every game. Clients are
thin: they render synced state and emit intents. The rules are a **pure reducer** —
`applyAction(state, playerId, action) => newState` — with all randomness injected, so every
edge case (full-group rent doubling, even-building, auctions on declined buys, multi-asset
trades, mortgage interest, cascading bankruptcy) is unit-tested deterministically *before*
any UI exists. The Colyseus server just validates an intent and calls the engine; the React
client just renders and sends intents. Because board content is data, the game is a
retheme-able platform rather than a one-off.

```
Client (React)  ──intent──▶  Colyseus server  ──▶  pure engine  ──newState──▶  broadcast
  renders state              validates + routes     applies rules              to clients
  (computes nothing            (no game logic)       (no I/O, injected RNG)
   authoritative)
```

## Tech stack

TypeScript (strict) · Colyseus + `@colyseus/schema` (authoritative multiplayer) ·
Express 5 · React 18 + Framer Motion · Vite 5 · Vitest. Deploys as a single Node web
service on Render (Express serves the built client and the WebSocket server same-origin).

## Project structure

```
src/
  data/     board.ts        # board layout, prices, rent tables, card decks (incl. Chaos deck)
            profanity.ts     # server-side chat filter word list
            tokens.ts        # player tokens
  engine/   types.ts         # GameState, Player, Action, Card discriminated unions
            engine.ts        # the pure reducer: createGame + applyAction — all game rules
            ai.ts            # bot decision logic
            queries.ts       # derived read helpers (net worth, holdings…)
  server/   GameRoom.ts      # Colyseus room: validates intent, calls engine, syncs state
            index.ts         # Express + Colyseus bootstrap; serves the built client
  client/   App.tsx, components/, hooks/  # React UI: board, deeds, trading, chat, lobby
```

## Quickstart

```bash
npm install            # installs deps and builds the client (postinstall)

npm run dev:server     # Colyseus + Express on the API port
npm run dev:client     # Vite dev server for the UI

npm test               # run the vitest suite (169 tests)
npm run typecheck      # strict tsc --noEmit
npm run build          # production client build
```

## Testing

The engine is designed to be tested without a server or a browser. Every rule that clones
commonly get wrong has focused coverage, and `playground.test.ts` drives a complete game to
a winner from a fixed seed — so the full rulebook is exercised deterministically on every
run. CI (`.github/workflows/ci.yml`) typechecks and runs the suite on every push and PR.

## Deploy

One Render web service (`render.yaml`): the same Node process serves the built Vite client
as static files **and** hosts the Colyseus WebSocket server, so client and server share an
origin. `NODE_ENV=production` disables all dev tooling; set `ALLOWED_ORIGINS` if the client
is ever served from a different origin.

## Working with Claude Code

This repo has a `CLAUDE.md` that Claude Code reads automatically — it encodes the
architecture rules and the tricky edge cases, so an agent builds in the right shape. Read
it before large changes.
