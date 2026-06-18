# CLAUDE.md

Project context for Claude Code. This file is read automatically at the start
of every session — keep it accurate and it steers the agent's work.

## What this is
A Nigerian-themed, Richup/Monopoly-style **online multiplayer** board game.
Players roll dice, buy Nigerian properties (Ajegunle → Banana Island), build
houses/hotels, pay rent in Naira, draw Chance/Esusu cards (written in Pidgin),
and try to bankrupt each other.

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
Board data, types, game setup, ROLL flow, property upgrading (building/selling houses/hotels), mortgaging/unmortgaging logic, auctions, player-to-player trading, and bankruptcy resolution are fully implemented. The multiplayer Colyseus + Express game server is completed, allowing client lobbies, token selection, room starting, turn progression actions over WebSockets, and automatic player reconnections. Verified with strict typechecking and 37 passing vitest tests.
