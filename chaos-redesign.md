# Chaos Mode Redesign — Proposal (Stage 1)

> **Litmus test for every chaos event:** *When this event hits, does the player
> who is currently winning have an interesting decision to make — or do they
> just passively take it?* If they just take it, it's a rubber-band, not a
> mechanic. A card passes only if it gives the leader **a threat to defend, an
> edge to seize, or a choice to make.**

This document is the plan only. No engine code is written yet.

---

## Part 1 — Audit of the current deck

Source: `CHAOS_CHANCE_CARDS` in `src/data/board.ts:633` and the chaos
`CardAction` kinds `blackout`, `airportStrike`, `propertyBonus`.

| Card | Effect | Whom it touches | Verdict | Why |
|---|---|---|---|---|
| **cx01 NEPA Blackout** (`blackout`) | Global rent off for a round | Everyone; hurts the biggest landlord | ❌ **FAIL** | Pure rubber-band. The leader (most rent-generating tiles) passively bleeds income; the trailing player who was about to pay simply skips paying. Nobody makes a decision. |
| **cx02 Fuel Scarcity** (`moveRelative -3`) | Drawer moves back 3 | Drawer only | ⚠️ **Weak pass** | Not a rubber-band (self-effect, symmetric), but shallow — no decision, negligible swing. Keep only as reflavored texture. |
| **cx03 Market Boom** (`propertyBonus`) | Drawer collects per house/hotel | Drawer only | ❌ **FAIL (different failure)** | Not a rubber-band — it's the *opposite*, a flat "rich get richer" windfall to whoever built most. But it's still a **passive** payout: the leader just collects, no decision. Runaway-leader fuel with zero counterplay. |
| **cx04 Owambe Expenses** (`payEach`) | Drawer pays each player | Drawer only | ❌ **FAIL** | Shallow cash swing. If the leader draws it they bleed; if a trailing player draws it they bleed. No decision either way. |
| **cx05 Bank Network Failure** (`money -50k`) | Drawer loses ₦50k | Drawer only | ❌ **FAIL** | Flat tax. No decision, no counterplay. |
| **cx06 Area Boys Levy** (`money -30k`) | Drawer loses ₦30k | Drawer only | ❌ **FAIL** | Flat tax. Same as above. |
| **cx07 Election Contract** (`collectFromEach`) | Drawer collects from each | Drawer only | ❌ **FAIL** | Flat windfall to the drawer. If the leader draws it, they get richer for free. No decision. |
| **cx08 Rent Freeze** (`blackout`) | Global rent off for a round | Everyone | ❌ **FAIL** | Re-skin of cx01. Same rubber-band. |
| **cx09 Airport Strike** (`airportStrike`) | Airport rent off for a round | Airport owner (often the leader) | ❌ **FAIL** | Rubber-band with a narrower target. Whoever monopolized airports passively loses income; no counterplay. |

**CardAction kinds specifically:**

- `blackout` — ❌ the core rubber-band. Rent simply stops; no agency for anyone.
- `airportStrike` — ❌ same failure, scoped to airports.
- `propertyBonus` — ❌ passive windfall; no decision, and it amplifies the leader.

**Summary:** 8 of 9 cards fail outright; 1 (`cx02`) is a weak, shallow pass. The
deck is entirely cash swings + two rent-off rubber-bands. Every card needs to be
replaced or rebuilt around an actual decision.

---

## Part 2 — Design principles for the new deck

Three shapes of a "passing" chaos event. Every card must be at least one:

1. **Aimable** — the *drawer* chooses a target (a zone, a rival, a tile). The
   drawer always has agency, including when the leader is the drawer (an edge to
   seize) and when a trailer aims at the leader (making them a threat the leader
   must answer).
2. **Defendable** — the affected player (usually the leader) can spend to opt
   out or soften the hit. This is the counterplay layer that turns a rent-off
   from a rubber-band into a threat-to-defend.
3. **A fork** — the event forces a choice between two costs/benefits (take now
   vs. double later; pay cash vs. surrender an asset). The interesting decision
   *is* the card.

**Bias:** prefer mechanics that add a **new interaction** over ones that just
move Naira. Cash-only cards are kept to zero in the core set.

**Architecture (non-negotiable, per `CLAUDE.md`):** every player choice is an
authoritative-server + pure-engine interaction. A card that needs a choice
creates a **pending decision** in `GameState` (exactly like `auctionState` /
`AuctionState` already do), the server routes the intent, and the pure reducer
resolves it. The client only renders the pending decision and sends intent —
it never computes money, targets, or eligibility.

---

## Part 3 — The redesigned deck

Every card below passes the litmus. Each entry lists the **decision**, **who
decides**, and the **litmus check**. Implementation requirements are in Part 4.

### Core mechanics (recommended — each introduces a distinct new interaction)

#### C1 — NEPA Load-Shedding *(aimable blackout + generator defense)*
> ⚡ *"NEPA don select who go suffer! Point one zone go darkness — but anybody
> wey get generator fit still collect their rent."*

- **What:** the drawer picks **one zone** (`ColorGroup`) to black out. Rent in
  that zone is waived until the round wraps — **but** any owner of a tile in
  that zone may pay the bank a **generator fee** to keep collecting rent there
  through the blackout (see mechanic **C2**).
- **Decision / who:** *drawer* chooses the target zone; each *affected owner*
  chooses whether to buy a generator.
- **Litmus:** ✅ Trailer draws → aims it at the leader's cash-cow zone (threat);
  the leader answers by paying for a generator or eating the loss (defend).
  Leader draws → aims it at a rival's best zone (edge to seize). Nobody passively
  takes it — the target is chosen and the victim can respond.

#### C2 — "I Get Generator!" *(standing defensive intent — the counterplay layer)*
> 🔌 *"Who get fuel, get light. Pay the bank, keep your rent running."*

- **What:** not a deck card — a **capability** that switches on whenever any
  blackout (C1) is active. Any solvent owner may send `BUY_GENERATOR` to pay the
  bank a per-zone fee and exempt their tiles in the darkened zone from the
  blackout for its duration.
- **Decision / who:** the *affected owner* (typically the leader) — pay to keep
  the lights on, or save the cash and eat the skipped rent.
- **Litmus:** ✅ This is the whole reason C1 passes. It converts "rent off" from
  a rubber-band into a defendable threat.

#### C3 — Fuel Queue Stockpile *(fork: take-now vs. double-next-round)*
> ⛽ *"Fuel don land! Sell now for quick money, or store am and sell double
> next round when the queue mad."*

- **What:** replaces `propertyBonus`. Compute the drawer's building income
  (per-house / per-hotel, same numbers as the old Market Boom). The drawer
  chooses: **collect it now**, or **stockpile** — collect **nothing now** and
  **double** at the next round wrap.
- **Decision / who:** the *drawer* (who, if they're the leader, has the most
  buildings and thus the biggest fork).
- **Litmus:** ✅ The leader gets the richest version of a real risk/greed choice —
  and the stockpiled payout is exposed to intervening chaos (a rival can black
  out their zone, EFCC can hit them) before it pays. An opportunity with tension,
  not a passive windfall.

#### C4 — Government Fire Sale *(edge to seize: discounted buy)*
> 🏷️ *"Government dey sell off asset cheap-cheap. Grab one now before the
> hammer fall."*

- **What:** the drawer may immediately buy **one currently-unowned tile** of
  their choice from the bank at a **discount** (e.g. 50% off list price), or
  decline. Bypasses landing on it.
- **Decision / who:** the *drawer* — which tile (complete a color set? deny a
  rival a monopoly? grab a premium darkblue?), or pass to keep the cash.
- **Litmus:** ✅ Pure edge-to-seize. The leader can weaponize their cash lead to
  close out a monopoly; a trailer can snipe a key tile. Everyone who draws it has
  a live, board-state-dependent decision.

#### C5 — EFCC Settlement *(targets the leader, with a fork)*
> 🕵🏾 *"EFCC don knock! Richest landlord, settle or forfeit property."*

- **What:** targets the player with the **highest net worth** (the leader, by
  definition). That player must either **pay a cash settlement** to the bank, or
  **surrender one property of their choice** to the bank — their pick.
- **Decision / who:** the *targeted leader* — pay cash vs. give up an asset
  (which one hurts least?).
- **Litmus:** ✅ This is the anti-runaway card *with* counterplay: it reliably
  pressures the leader but hands them a genuine "which of my things do I protect"
  fork rather than a flat confiscation. The pending decision belongs to a player
  who may not be the current roller — the server routes it to them (same pattern
  as a non-current player acting in an auction).

### Extended mechanics (strong, optional — pick up if the deck wants more variety)

#### C6 — Owambe Rent Surge *(aimable opportunity — inverse of the blackout)*
> 🎉 *"Owambe season! One zone dey collect double rent — point am."*

- **What:** the drawer picks one zone; rent there is **doubled** until the round
  wraps. Symmetric to C1 but positive — reuses the same "zone modifier" plumbing.
- **Decision / who:** the *drawer* — normally aimed at a zone they own to
  supercharge it.
- **Litmus:** ✅ Edge-to-seize opportunity. The leader can amplify their best
  zone; a trailer can spike a zone they own to claw back. Agency lives in the
  aim. (Note: benefits the *owner* of the chosen zone, so it never silently
  victimizes the leader — it's an opportunity, not a threat.)

#### C7 — Area Boys Shakedown *(aimable extortion, with a resist fork)*
> 🚧 *"Area boys don corner one landlord. Pay us, or pay to chase us —
> your choice."*

- **What:** the drawer names **one rival**. That rival must either **pay a levy
  to the drawer**, or pay a **smaller fee to the bank** to "hire their own boys"
  and avoid paying the rival.
- **Decision / who:** *drawer* chooses the victim; *victim* chooses pay-rival vs.
  pay-bank-less.
- **Litmus:** ✅ Two-sided agency. A trailer can aim it at the leader (threat);
  the leader picks the cheaper poison (defend). Denies the "flat pay ₦X" failure
  of old cx04/cx06.

#### C8 — Fuel Scarcity Reroute *(reflavor of the one weak survivor, with a choice)*
> ⛽ *"Bad road everywhere. Waka back to any junction you fit reach —
> pick your spot."*

- **What:** upgrade `cx02` from a fixed `moveRelative -3` into a **bounded
  choice**: the drawer moves back **1–3 spaces of their choosing** (they pick the
  landing tile). Small, but converts a forced nudge into a positional decision
  (dodge a hotel, land on an unowned tile, hit a Hustle).
- **Decision / who:** the *drawer*.
- **Litmus:** ✅ Weak but genuine: turns the deck's one non-failing-but-shallow
  card into an actual micro-decision. Include only if we want a light-weight card
  for pacing.

### What got cut and why

- `blackout` (global, un-aimed), `airportStrike`, and the flat cash cards
  (`money`, `payEach`, `collectFromEach` as *chaos* cards) are **removed** from
  the chaos deck. Their failures can't be patched by tuning numbers — they have
  no decision surface. Their flavor is absorbed into C1/C3/C5/C7. (These
  `CardAction` kinds stay in the codebase — the **base** Chance/Hustle decks
  still use them and must remain untouched.)

**Recommended shipping set:** C1+C2 (aimable blackout + generator), C3, C4, C5.
That's four cards + one standing intent, covering all three passing shapes
(aimable, defendable, fork) and every seed direction you named. C6–C8 are
ready if you want a fuller deck.

---

## Part 4 — What each mechanic needs (engine + state)

All new state mirrors the existing `auctionState` / `AuctionState` pattern
(`src/engine/types.ts:45`, `GameState.auctionState` at `:90`) and the existing
zone-scoped blackout field (`GameState.blackout` at `:99`). New `Action` kinds
join the union at `types.ts:115`. All resolution lives in the pure reducer;
the server validates + routes; the client renders + sends intent.

### New / changed `CardAction` kinds (`board.ts:93`)

| Kind | Shape | Used by |
|---|---|---|
| `aimableBlackout` | `{ kind: "aimableBlackout" }` | C1 |
| `rentSurge` | `{ kind: "rentSurge" }` | C6 |
| `fuelStockpile` | `{ kind: "fuelStockpile"; perHouse: number; perHotel: number }` | C3 (replaces `propertyBonus` usage in chaos) |
| `fireSale` | `{ kind: "fireSale"; discountPct: number }` | C4 |
| `efccSettlement` | `{ kind: "efccSettlement"; cashAmount: number }` | C5 |
| `areaBoysShakedown` | `{ kind: "areaBoysShakedown"; levy: number; resistFee: number }` | C7 |
| `fuelReroute` | `{ kind: "fuelReroute"; maxSteps: number }` | C8 |

`blackout` / `airportStrike` / `propertyBonus` stay in the union (base decks / back-compat) but are no longer referenced by chaos cards.

### New pending-decision phases + state (the interactive layer)

Add to the `Phase` union (`types.ts:37`) and to `GameState`. Each is a nullable
field, populated only while its decision is live, cleared on resolution — exactly
like `auctionState`.

| Mechanic | New `Phase` | New `GameState` field (sketch) | New `Action`(s) | Decider |
|---|---|---|---|---|
| **C1** aimable blackout | `awaiting-blackout-target` | `pendingBlackout?: { drawerId; selectableZones: ColorGroup[] } \| null` | `CHOOSE_BLACKOUT_ZONE { zone }` | drawer |
| **C1** blackout state | *(none — extend existing)* | extend `blackout` → `{ untilRound; zone?: ColorGroup; generatorOwners: PlayerId[] }` | — | — |
| **C2** generator | *(none — reactive)* | *(uses `blackout.generatorOwners`)* | `BUY_GENERATOR { }` (fee to bank; adds sender to `generatorOwners`) | any affected owner |
| **C3** stockpile | `awaiting-stockpile-choice` | `pendingStockpile?: { playerId; amount } \| null`; on "double": `deferredPayouts?: Array<{ playerId; amount; dueRound }>` | `CHOOSE_STOCKPILE { mode: "now" \| "double" }` | drawer |
| **C4** fire sale | `awaiting-firesale-pick` | `pendingFireSale?: { drawerId; discountPct; eligibleTiles: number[] } \| null` | `CHOOSE_FIRESALE_TILE { pos } \| DECLINE_FIRESALE` | drawer |
| **C5** EFCC | `awaiting-efcc-choice` | `pendingEfcc?: { targetId; cashAmount } \| null` | `EFCC_PAY_CASH \| EFCC_SURRENDER { pos }` | targeted leader (may ≠ current player) |
| **C6** rent surge | `awaiting-surge-target` | `pendingSurge?: { drawerId; selectableZones } \| null`; effect: `rentSurge?: { untilRound; zone } \| null` | `CHOOSE_SURGE_ZONE { zone }` | drawer |
| **C7** shakedown | `awaiting-shakedown-target` then `awaiting-shakedown-response` | `pendingShakedown?: { drawerId; levy; resistFee; victimId? } \| null` | `CHOOSE_SHAKEDOWN_TARGET { playerId }`, `SHAKEDOWN_PAY_RIVAL \| SHAKEDOWN_RESIST` | drawer, then victim |
| **C8** reroute | `awaiting-reroute-choice` | `pendingReroute?: { drawerId; maxSteps } \| null` | `CHOOSE_REROUTE { steps }` | drawer |

### Rent-resolution changes

Rent is computed in the reducer's rent path (the landing handler around
`engine.ts:1844`, and the card-driven rent path around `:2138`). Changes:

- **Zone-scoped blackout (C1):** the existing global `if (state.blackout)` check
  becomes: waive rent **only** if the tile's `group === blackout.zone` **and**
  the owner is **not** in `blackout.generatorOwners`. This is the one edit to an
  existing effect; base game is untouched because base decks never set `blackout`.
- **Rent surge (C6):** in the same rent path, if `rentSurge` is active and the
  tile's `group === rentSurge.zone`, double the computed rent.

### Deferred payouts + expiry (C3, C1, C6)

`expireRoundEffects` (`engine.ts:46`) already clears round-scoped effects at
every wrap point. Extend it to:
- clear `rentSurge` on its `untilRound` (mirror the blackout clause);
- pay out any `deferredPayouts` whose `dueRound` has arrived (C3 "double next
  round"), crediting the player and logging it.

Keep the existing `blackout` / `airportStrike` expiry clauses as-is.

### Shared helpers to factor out

- `computeNetWorth(state, playerId): number` — extract the inline net-worth math
  at `engine.ts:1227` so C5 can pick the richest player deterministically (ties
  broken by a stable rule, e.g. lowest player index, so the pure engine stays
  reproducible).
- `zonesWithCollectibleRent(state): ColorGroup[]` — for C1/C6 selectable-zone
  lists (zones that actually have an owned, un-mortgaged tile), so the drawer
  can't aim at an empty zone.

### Server + client routing (no game logic)

- **Server** (`GameRoom.ts`): validate that the intent's sender matches the
  decider named in the pending field (drawer / affected owner / targeted leader),
  then call the pure reducer. For pending decisions with a timer (like auctions),
  stamp a `deadline` and auto-resolve on expiry with a sensible default
  (blackout/surge: pick a random eligible zone via injected RNG; stockpile:
  default "now"; fire sale: decline; EFCC: pay cash if solvent else surrender the
  cheapest tile; shakedown: resist if affordable). The pure engine never reads
  `deadline` (stays null in tests), same contract as `AuctionState`.
- **Client:** renders the pending decision (zone picker, tile picker,
  cash-vs-asset fork, generator-buy button) and sends intent. Computes nothing
  authoritative — no prices, no eligibility, no net worth.

---

## Part 5 — Test plan (Stage 2)

Base game and the current **76 tests stay green** — no base `CardAction` kind
changes behavior; the only edit to an existing effect is the zone-scoping of
`blackout`, which base decks never trigger.

New vitest coverage (deterministic, injected RNG), one focused test per path:

- **C1:** draw → `awaiting-blackout-target`; illegal chooser rejected; choosing a
  zone waives rent only for that zone's owners; other zones still collect;
  expires on wrap.
- **C2:** during a blackout, `BUY_GENERATOR` debits the bank fee, adds the owner
  to `generatorOwners`, and that owner collects rent again while others in the
  zone still don't; non-owner / insolvent sender rejected.
- **C3:** "now" pays building income immediately; "double" pays nothing now, adds
  a `deferredPayout`, and pays 2× at the next wrap; a blackout on the drawer's
  zone in between does **not** touch the deferred payout (it's income, not rent).
- **C4:** discounted purchase debits `price * (1 - discountPct)` to the bank,
  assigns ownership, removes the tile from `eligibleTiles`; buying an owned tile
  or overpaying rejected; `DECLINE_FIRESALE` clears cleanly.
- **C5:** targets the true highest-net-worth player (with a deliberate tie to lock
  the tie-break); `EFCC_PAY_CASH` debits; `EFCC_SURRENDER` returns a chosen tile
  to the bank; insolvent target forced down the surrender path; decision routed to
  a **non-current** player.
- **C6:** doubles rent only in the chosen zone; expires on wrap; stacks sanely
  with an unrelated-zone blackout.
- **C7:** drawer targets a rival; `SHAKEDOWN_PAY_RIVAL` transfers to the drawer;
  `SHAKEDOWN_RESIST` pays the smaller fee to the bank; wrong responder rejected.
- **C8:** reroute moves exactly the chosen 1–`maxSteps`; out-of-range rejected.
- **Full-game smoke:** a headless chaos-mode game runs to completion (roll → chaos
  events with auto-resolved pending decisions → bankruptcy) without deadlock.

---

## Recommendation

Ship **C1 + C2 + C3 + C4 + C5** as the core redesign — four cards and one
standing intent that together deliver all three passing shapes (aimable,
defendable, fork) and every direction you named (aimable blackout, generator
buyout, discounted buy, stockpile-for-double). C6–C8 are specced and ready to
fold in for a fuller deck.

**Awaiting your review before writing any engine code (Stage 2).**
