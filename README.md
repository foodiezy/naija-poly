# Naija Richup 🎲

A Nigerian-themed, Richup/Monopoly-style **online multiplayer** board game.
Buy properties from Ajegunle to Banana Island, charge rent in Naira, and bankrupt
your opponents. Chance and Esusu cards talk Pidgin: _"You don hammer federal
contract! Waka go Banana Island."_

> Legal note: game *mechanics* aren't copyrightable, which is why Monopoly
> alternatives exist. Use only your **own** names, art, and code — don't copy
> Hasbro's branding or any other game's assets. Not legal advice.

## Project structure
```
src/
  data/     board.ts        # board layout, prices, rent tables, card decks (✅)
            board.test.ts    # smoke tests (✅ passing)
  engine/   types.ts         # GameState, Player, Action shapes (✅)
            engine.ts        # pure reducer: createGame + applyAction (⬜ next)
  server/   # Colyseus multiplayer rooms (later)
  client/   # React / Canvas UI (last)
```

## Getting started
```bash
npm install
npm test          # runs the board smoke tests (5 passing)
npm run typecheck # strict TS, no emit
```

## Architecture in one paragraph
An **authoritative server** owns the true game state. Clients send intent
(`ROLL`, `BUY`, `BID`…) and receive updated state. All rules live in a **pure
engine** — `applyAction(state, playerId, action) => newState` — which is fully
unit-tested headless before any UI exists. Board content is plain data, so you
retheme by editing `src/data/board.ts`, not the logic.

## Roadmap
1. ✅ Board + card data, typed
2. ⬜ Engine: roll/move/buy/rent/cards/tax (+ tests)
3. ⬜ Engine: building, mortgage, **auction**, **trading**, bankruptcy
4. ⬜ Colyseus server: rooms, invite links, reconnect handling
5. ⬜ Client: board UI, dice/token animation, trade modal
6. ⬜ Polish: bots, sound, mobile, Paystack/Flutterwave if monetizing

## Working with Claude Code
This repo has a `CLAUDE.md` that Claude Code reads automatically — it encodes
the architecture rules and the tricky edge cases, so the agent builds in the
right shape. See that file before large changes.
