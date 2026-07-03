# CLAUDE.md

Project context for Claude Code. This file is read automatically at the start
of every session — keep it accurate and it steers the agent's work.

## What this is
**Odogwu Empire** — A pan-Nigerian, property-trading **online multiplayer** board game.
The board spans eight zones (Borno, Kwara, Enugu, Kaduna, Edo, Rivers, Abuja, Lagos)
so every Nigerian sees a city they recognise. Players roll dice, buy properties
(Maiduguri → Ikoyi), build houses/hotels, pay rent in Naira, draw Chance / Hustle
cards (written in Pidgin), and try to bankrupt each other. "Free parking" is the
**Mama Put Rest Stop**; the optional jackpot is the **Mama Put Pot**.

## Non-negotiable architecture rules
- **Authoritative server.** The server owns the true game state. Clients send
  *intent* (ROLL, BUY, BID...) and receive state updates. NEVER let the client
  compute money, rent, or ownership.
- **The engine is PURE.** `applyAction(state, playerId, action) => newState`.
  No mutation of inputs, no I/O, no randomness except via an injected RNG so
  tests are deterministic. All game rules live here, not in the server or UI.
- **Data is data.** Board layout, prices, rent tables, and cards live in
  `src/data/board.ts`. Retheme by editing data; never hardcode prices in logic.
- **Test as you build.** Every engine rule gets a vitest test. The headless
  engine must be able to play a full game (roll → rent → bankrupt) in tests
  before any UI exists.

## Rules that clones commonly get wrong — implement carefully
1. Full unimproved color group → rent[0] is **doubled**.
2. **Even building**: can't add a 2nd house to a property until every property
   in its group has a 1st. Same when selling.
3. **Auction** on DECLINE_BUY: all solvent players bid; highest pays the bank.
4. **Trading**: multi-asset (cash + tiles + jail cards), both sides must accept.
5. **Mortgage** interest on unmortgage; buildings must be sold before mortgaging.
6. **Bankruptcy**: assets go to creditor (or bank); recompute remaining players.

## Layout
- `src/data/`   — board + card data (done)
- `src/engine/` — pure rules: `types.ts` (done), `engine.ts` (TODO: reducer)
- `src/server/` — Colyseus rooms (later); handlers just validate + call engine
- `src/client/` — React/Canvas UI (last); renders synced state

## Commands
- `npm test` — run vitest once
- `npm run test:watch` — watch mode
- `npm run typecheck` — tsc --noEmit (strict)

## Conventions
- Strict TypeScript. No `any`. Discriminated unions for tiles/actions/cards.
- Money is plain integers of Naira (no floats).
- Keep functions small and pure; prefer many tested helpers over one big switch.

## Current state
Feature-complete and deployment-ready. Engine: full rules (roll/buy/rent/cards,
building with bank supply caps, mortgage, auctions, multi-asset trading,
bankruptcy, forfeit) plus opt-in Chaos Mode (NEPA blackout card freezes rent
for a round). Server: Colyseus room with lobby/settings/AI bots/turn & auction
timers, reconnection (60s grace), room lock on start, per-client rate
limiting, redacted state sync (deck order hidden from clients), CORS pinned
via ALLOWED_ORIGINS. Client: full board UI with real place photos, deed cards
with owner management (upgrade/sell/mortgage from the card), trading, chat
(+DMs), invite links (?room=CODE), onboarding, sounds, error boundary, vendor
bundle splitting. Deploys as ONE Render web service (render.yaml): Express
serves the built client + WebSockets same-origin. 76 passing vitest tests,
strict typecheck.
