# Naira Empire — v1 Scope Doc

## What it is
An online multiplayer property-trading board game inspired by classic games like Monopoly, themed around Nigerian cities, culture, and currency. Not a licensed Monopoly product — distinct branding, board layout, and naming throughout.

## Players
2–6 per game room. Join via shareable room code/link. No accounts required for v1 (just a display name on join).

## Board
40 tiles, structured like the classic format but fully re-themed:
- **Properties (28 tiles):** Nigerian cities/landmarks grouped into color sets (e.g. Lagos Island, Victoria Island, Abuja, Port Harcourt, Kano, Ibadan, Enugu, Calabar...)
- **Transport hubs (4 tiles):** replacing railroads — e.g. major airports or bus terminals
- **Utilities (2 tiles):** e.g. power (NEPA/PHCN-style) and telecom
- **Chance / Community Chest (6 tiles):** renamed, rewritten with local flavor and humor
- **Corners/specials (4 tiles):** Go, Jail, Free Parking, Go-To-Jail equivalents
- **Tax tiles (2 tiles)**

Property upgrade tiers need a local-flavored name (placeholder: Bungalow → Duplex → Mansion) instead of houses/hotels.

## Rules in v1
- Roll dice, move, land, resolve tile
- Buy property on landing (or decline → triggers auction)
- Rent collection, including color-set bonus rent
- Auctions for declined properties
- Full player-to-player trading: cash, properties, get-out-of-jail cards
- Mortgaging properties for cash, unmortgaging
- Jail: pay to leave, use card, or roll for doubles
- Bankruptcy handling and liquidation
- Win condition: last player solvent, or richest player after a turn limit (configurable)

## Explicitly OUT of v1
- Spectator mode
- In-game chat
- Custom house-rule toggles beyond Free Parking jackpot (stub only)
- Persistent accounts/stats/leaderboards
- Native mobile app (web-responsive only)
- Any real-money integration

## Tech stack
- **Backend:** Node.js, WebSockets (Socket.IO), server-authoritative game state
- **Frontend:** React, board rendered as positioned tiles (SVG/CSS), no canvas engine needed
- **State/session storage:** Redis for active room state
- **Deployment target:** Render or Fly.io for initial launch (cheap, fast to stand up)

## Build order
1. Local single-player prototype — prove the rules engine alone (no networking)
2. Add WebSocket multiplayer for the core loop: join room, take turns, roll, move, buy, pay rent
3. Layer in auctions, trading, mortgaging, jail, bankruptcy
4. Polish: reconnect handling, room codes, Nigerian theming/content, mobile-responsive layout, sound

## Open decisions (need team sign-off)
- Final property tier names (houses/hotels equivalent)
- Starting cash amount and property price scale (in Naira — needs balancing pass)
- Turn limit for the "richest after N turns" win condition, if used
- Token/piece designs (e.g. okada, danfo bus, agbada — needs art)
