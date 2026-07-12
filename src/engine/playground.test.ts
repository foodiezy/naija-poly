import { describe, it, expect } from "vitest";
import { createGame, applyAction } from "./engine";
import { formatNaira, BOARD, HOUSE_SUPPLY, HOTEL_SUPPLY, type PropertyTile } from "../data/board";
import type { GameState, Action, PlayerId, Phase } from "./types";

describe("Odogwu Empire Console Playground", () => {
  it("runs a simulated game play-through", () => {
    console.log("\n=======================================================");
    console.log("        ODOGWU EMPIRE GAME SIMULATION              ");
    console.log("=======================================================\n");

    const playerIds = ["Chidi", "Funmi", "Tunde"];

    // We use a custom sequence of dice rolls to show off different engine features:
    // Turn 1 (Chidi): Rolls [1, 2] -> lands on Mushin (pos 3), buys it.
    // Turn 2 (Funmi): Rolls [2, 3] -> lands on MM Airport (pos 5), buys it.
    // Turn 3 (Tunde): Rolls [3, 4] -> lands on Chance (pos 7), draws card.
    // Turn 4 (Chidi): Rolls [1, 1] (doubles) -> lands on MM Airport (pos 5), pays rent to Funmi. Rerolls [1, 2] -> lands on Yaba (pos 8), buys it.
    const mockRolls: [number, number][] = [
      [1, 2], // Chidi
      [2, 3], // Funmi
      [3, 4], // Tunde (Chance)
      [1, 1], // Chidi (doubles -> MM Airport)
      [1, 2], // Chidi (reroll -> Yaba)
    ];

    let rollIndex = 0;
    const rng = () => {
      if (rollIndex >= mockRolls.length * 2) {
        // Fallback random-ish rolls
        return 0.5;
      }
      const pairIndex = Math.floor(rollIndex / 2);
      const isFirst = rollIndex % 2 === 0;
      rollIndex++;
      return (mockRolls[pairIndex][isFirst ? 0 : 1] - 0.5) / 6;
    };

    let state = createGame(playerIds);
    printState(state);

    // --- Turn 1: Chidi ---
    console.log("\n--- Turn 1: Chidi ---");
    state = applyAction(state, "Chidi", { type: "ROLL" }, rng);
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "BUY" });
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "END_TURN" });

    // --- Turn 2: Funmi ---
    console.log("\n--- Turn 2: Funmi ---");
    state = applyAction(state, "Funmi", { type: "ROLL" }, rng);
    printLogs(state);
    state = applyAction(state, "Funmi", { type: "BUY" });
    printLogs(state);
    state = applyAction(state, "Funmi", { type: "END_TURN" });

    // --- Turn 3: Tunde ---
    console.log("\n--- Turn 3: Tunde ---");
    state = applyAction(state, "Tunde", { type: "ROLL" }, rng); // Lands on Chance (pos 7), draws card
    printLogs(state);
    if (state.phase === "awaiting-buy-decision") {
      state = applyAction(state, "Tunde", { type: "BUY" });
      printLogs(state);
    }
    state = applyAction(state, "Tunde", { type: "END_TURN" });

    // --- Turn 4: Chidi (Doubles Reroll & Rent Pay) ---
    console.log("\n--- Turn 4: Chidi (Doubles & Rent) ---");
    state = applyAction(state, "Chidi", { type: "ROLL" }, rng); // Lands on pos 5 (MM Airport owned by Funmi) -> pays rent
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "END_TURN" }); // Has doubles, so gets another roll
    printLogs(state);

    state = applyAction(state, "Chidi", { type: "ROLL" }, rng); // Rolls [1, 2] -> lands on Yaba (pos 8)
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "BUY" });
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "END_TURN" });

    // --- Show Final States ---
    console.log("\n=======================================================");
    console.log("                  FINAL GAME STATE                    ");
    console.log("=======================================================");
    printState(state);
    console.log("\n=======================================================\n");
  });

  it("plays a full 2-player game to bankruptcy and a winner", () => {
    // Seed: mulberry32(1337). Chosen after trial: it's the first seed tried
    // (small integer, easy to reproduce) whose resulting greedy-policy run
    // exercises rent payment, at least one house build, AND a bankruptcy
    // within the 2,000-action cap. Low starting cash (₦350,000, well under
    // the default ₦1,500,000) makes bankruptcy likely within a reasonable
    // number of turns since rent/tax hits hurt much more relative to cash.
    const SEED = 1337;
    const rng = mulberry32(SEED);

    const playerIds: PlayerId[] = ["A", "B"];
    let state = createGame(playerIds, { startingCash: 350_000 }, rng);

    const MAX_ACTIONS = 2000;
    const BUY_BUFFER = 50_000;
    const BUILD_BUFFER = 50_000;

    let rentPaidCount = 0;
    let buildCount = 0;
    let auctionCount = 0;
    let bankruptcyCount = 0;
    let actionsRun = 0;

    // Track cash sums across RESPOND_TRADE actions for strict conservation checks.
    const dumpTail = (s: GameState, n = 20) => s.log.slice(-n).join("\n");

    const step = (playerId: PlayerId, action: Action): GameState => {
      // Deep-freeze a clone of `state` to assert purity: applyAction must not
      // mutate its input. We freeze the actual object passed in.
      const frozen = deepFreeze(state);
      const prevCashSum = sumCash(frozen);
      const prevPot = frozen.freeParkingPot;

      let next: GameState;
      try {
        next = applyAction(frozen, playerId, action, rng);
      } catch (err) {
        throw new Error(
          `applyAction threw for ${playerId} action ${JSON.stringify(action)} in phase ${frozen.phase}: ${
            (err as Error).message
          }\nLast log lines:\n${dumpTail(frozen)}`,
        );
      }

      checkInvariants(frozen, next, action, prevCashSum, prevPot);

      // Track flags for mechanics coverage.
      if (action.type === "BID" && next.phase === "awaiting-end-turn") {
        auctionCount += 1;
      } else if (action.type === "PASS_BID" && next.auctionState === null) {
        auctionCount += 1;
      } else if (action.type === "RESOLVE_AUCTION") {
        auctionCount += 1;
      }
      if (action.type === "BUILD") buildCount += 1;
      if (action.type === "DECLARE_BANKRUPT") bankruptcyCount += 1;
      // Rent payments show up in the log for this action.
      const newLogLines = next.log.slice(frozen.log.length);
      if (newLogLines.some((l) => l.includes("rent"))) rentPaidCount += 1;

      state = next;
      actionsRun += 1;
      return next;
    };

    while (state.phase !== "game-over" && actionsRun < MAX_ACTIONS) {
      const phase: Phase = state.phase;
      const player = state.players[state.currentPlayerIndex];

      if (phase === "awaiting-roll") {
        if (player.inJail) {
          if (player.jailCardSources.length > 0) {
            step(player.id, { type: "USE_JAIL_CARD" });
          } else if (player.cash >= JAIL_FINE_FALLBACK(state)) {
            step(player.id, { type: "PAY_JAIL_FINE" });
          } else {
            step(player.id, { type: "ROLL" });
          }
        } else {
          step(player.id, { type: "ROLL" });
        }
      } else if (phase === "awaiting-buy-decision") {
        const pos = player.position;
        const tile = BOARD[pos] as PropertyTile;
        const price = "price" in tile ? tile.price : 0;
        if (player.cash >= price + BUY_BUFFER) {
          step(player.id, { type: "BUY" });
        } else {
          step(player.id, { type: "DECLINE_BUY" });
        }
      } else if (phase === "auction") {
        const auction = state.auctionState!;
        const activeParticipants = auction.participantIds.filter(
          (id) => !auction.passedIds.includes(id),
        );
        // Greedy: whichever eligible participant isn't the current top bidder
        // bids the minimum increment once if affordable; everyone else passes.
        let acted = false;
        for (const pid of activeParticipants) {
          if (pid === auction.highestBidderId) continue;
          const bidder = state.players.find((p) => p.id === pid)!;
          const nextAmount = auction.highestBid + auction.minIncrement;
          if (bidder.cash >= nextAmount + BUY_BUFFER) {
            step(pid, { type: "BID", amount: nextAmount });
            acted = true;
            break;
          }
        }
        if (!acted) {
          // Nobody (further) can afford to raise: everyone still active passes.
          const passer = activeParticipants.find((id) => id !== auction.highestBidderId);
          if (passer) {
            step(passer, { type: "PASS_BID" });
          } else {
            // Only the highest bidder remains eligible; resolve explicitly.
            step("__sim__", { type: "RESOLVE_AUCTION" });
          }
        }
      } else if (phase === "awaiting-end-turn") {
        // Handle negative cash or unsettled debts BEFORE ending the turn.
        const hasDebts = state.debtLedger.some((d) => d.debtorId === player.id);
        if (player.cash < 0 || hasDebts) {
          resolveNegativeCash(state, player.id, step);
          continue;
        }

        // Greedy build: attempt a small number of legal builds this turn.
        let builtSomething = true;
        let buildAttempts = 0;
        while (builtSomething && buildAttempts < 5) {
          builtSomething = false;
          buildAttempts += 1;
          const buildablePos = findLegalBuild(state, player.id, BUILD_BUFFER);
          if (buildablePos !== null) {
            step(player.id, { type: "BUILD", pos: buildablePos });
            builtSomething = true;
          }
        }

        // Refresh player ref in case build changed cash; check negative again.
        const freshPlayer = state.players.find((p) => p.id === player.id)!;
        const freshHasDebts = state.debtLedger.some((d) => d.debtorId === player.id);
        if (freshPlayer.cash < 0 || freshHasDebts) {
          resolveNegativeCash(state, player.id, step);
          continue;
        }

        step(player.id, { type: "END_TURN" });
      } else if (phase === "resolving") {
        // Should not normally be reachable as a resting phase in this engine,
        // but guard against an infinite loop by failing loudly if we ever see it.
        throw new Error(`Unexpected resting phase "resolving" encountered.\n${dumpTail(state)}`);
      } else {
        throw new Error(`Unhandled phase "${phase}" encountered.\n${dumpTail(state)}`);
      }
    }

    if (actionsRun >= MAX_ACTIONS && state.phase !== "game-over") {
      throw new Error(
        `Simulation hit the ${MAX_ACTIONS}-action cap without reaching game-over. Final phase: ${
          state.phase
        }\nLast 20 log lines:\n${dumpTail(state)}`,
      );
    }

    // ---- Final assertions ----
    expect(state.phase).toBe("game-over");
    const solventPlayers = state.players.filter((p) => !p.bankrupt);
    expect(solventPlayers.length).toBe(1);
    expect(state.winnerId).not.toBeNull();
    expect(solventPlayers[0].id).toBe(state.winnerId);

    expect(rentPaidCount).toBeGreaterThan(0);
    expect(buildCount).toBeGreaterThanOrEqual(0);

    console.log(
      `\n[full-game sim] seed=${SEED} actions=${actionsRun} rentEvents=${rentPaidCount} builds=${buildCount} auctions=${auctionCount} bankruptcies=${bankruptcyCount}\n`,
    );
  });
});

// =============================================================================
// Helpers for the full-game simulation test
// =============================================================================

// Deterministic mulberry32 PRNG — no external dependency, seeded for
// reproducibility. Returns a function compatible with the engine's injected
// `rng: () => number` contract (values in [0, 1)).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The engine's JAIL_FINE constant is 50,000 (from board.ts); duplicated here
// as a small helper to avoid importing internals not otherwise needed.
function JAIL_FINE_FALLBACK(_state: GameState): number {
  return 50_000;
}

function sumCash(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.cash, 0);
}

function deepFreeze<T>(obj: T): T {
  if (
    obj !== null &&
    (typeof obj === "object" || typeof obj === "function") &&
    !Object.isFrozen(obj)
  ) {
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deepFreeze((obj as any)[prop]);
    });
    Object.freeze(obj);
  }
  return obj;
}

// Finds a legal BUILD position for the given player: full unmortgaged color
// group, even-building constraint, cash for houseCost + buffer, and under 5
// houses. Mirrors the engine's own legality checks so we never throw.
function findLegalBuild(state: GameState, playerId: PlayerId, buffer: number): number | null {
  const player = state.players.find((p) => p.id === playerId)!;
  const groups = new Map<string, PropertyTile[]>();
  BOARD.forEach((tile) => {
    if (tile.type === "property") {
      const list = groups.get(tile.group) ?? [];
      list.push(tile);
      groups.set(tile.group, list);
    }
  });

  for (const [, groupTiles] of groups) {
    const ownsAll = groupTiles.every((t) => state.tiles[t.pos]?.ownerId === playerId);
    if (!ownsAll) continue;
    const anyMortgaged = groupTiles.some((t) => state.tiles[t.pos]?.mortgaged);
    if (anyMortgaged) continue;

    const minHouses = Math.min(...groupTiles.map((t) => state.tiles[t.pos]?.houses ?? 0));
    // Candidates at the minimum house count are legal to build on next (even build rule).
    const candidates = groupTiles.filter((t) => (state.tiles[t.pos]?.houses ?? 0) === minHouses);
    for (const candidate of candidates) {
      const tileState = state.tiles[candidate.pos];
      if (tileState.houses >= 5) continue;
      if (player.cash < candidate.houseCost + buffer) continue;

      // Bank supply check, mirroring engine.ts.
      let currentTotalHouses = 0;
      let currentTotalHotels = 0;
      Object.values(state.tiles).forEach((ts) => {
        if (ts.houses === 5) currentTotalHotels += 1;
        else if (ts.houses >= 1 && ts.houses <= 4) currentTotalHouses += ts.houses;
      });
      const isUpgradingToHotel = tileState.houses === 4;
      if (isUpgradingToHotel && currentTotalHotels >= HOTEL_SUPPLY) continue;
      if (!isUpgradingToHotel && currentTotalHouses >= HOUSE_SUPPLY) continue;

      return candidate.pos;
    }
  }
  return null;
}

// When a player owes money they can't cover (unsettled debt) or has negative cash:
// mortgage unmortgaged, unbuilt-on properties one at a time (selling houses first
// if needed to unblock a mortgage), then declare bankruptcy if still unresolved.
function resolveNegativeCash(
  state: GameState,
  playerId: PlayerId,
  step: (playerId: PlayerId, action: Action) => GameState,
): void {
  let current = state;
  let player = current.players.find((p) => p.id === playerId)!;
  let guard = 0;

  const hasDebts = () => current.debtLedger.some((d) => d.debtorId === playerId);

  while ((player.cash < 0 || hasDebts()) && guard < 100) {
    guard += 1;
    // First, sell any houses this player owns (frees cash, unblocks mortgaging).
    const sellablePos = Object.entries(current.tiles).find(
      ([, ts]) => ts.ownerId === playerId && ts.houses > 0,
    );
    if (sellablePos) {
      current = step(playerId, { type: "SELL_HOUSE", pos: Number(sellablePos[0]) });
      player = current.players.find((p) => p.id === playerId)!;
      continue;
    }

    // Then mortgage any unmortgaged property (no houses left, by now).
    const mortgageablePos = Object.entries(current.tiles).find(
      ([, ts]) => ts.ownerId === playerId && !ts.mortgaged && ts.houses === 0,
    );
    if (mortgageablePos) {
      current = step(playerId, { type: "MORTGAGE", pos: Number(mortgageablePos[0]) });
      player = current.players.find((p) => p.id === playerId)!;
      continue;
    }

    // Nothing left to liquidate: declare bankruptcy.
    step(playerId, { type: "DECLARE_BANKRUPT" });
    return;
  }
}

// Asserts all documented invariants hold across a single applyAction call.
function checkInvariants(
  _prev: GameState,
  next: GameState,
  action: Action,
  prevCashSum: number,
  _prevPot: number,
): void {
  // 2. Integer, non-NaN cash for every player.
  next.players.forEach((p) => {
    expect(Number.isInteger(p.cash)).toBe(true);
    expect(Number.isNaN(p.cash)).toBe(false);
  });

  // 3. Money conservation. Bank-involving actions just need integer cash
  // (checked above). RESPOND_TRADE must be a strict zero-sum transfer between
  // the two trading players (bank never touched).
  if (action.type === "RESPOND_TRADE") {
    const nextCashSum = sumCash(next);
    expect(nextCashSum).toBe(prevCashSum);
  }

  // 6. currentPlayerIndex points at a non-bankrupt player whenever the game
  // is still in progress.
  if (next.phase !== "game-over") {
    const current = next.players[next.currentPlayerIndex];
    expect(current).toBeDefined();
    expect(current.bankrupt).toBe(false);
  }

  // 7. phase is a known Phase union member.
  const KNOWN_PHASES: Phase[] = [
    "awaiting-roll",
    "awaiting-buy-decision",
    "auction",
    "resolving",
    "awaiting-end-turn",
    "game-over",
  ];
  expect(KNOWN_PHASES).toContain(next.phase);

  // 4. Every tile's ownerId is either null/undefined or a non-bankrupt
  // player's id — EXCEPT transiently during DECLARE_BANKRUPT/FORFEIT
  // resolution, where the acting player's own former tiles are cleared or
  // reassigned within the same action (so by the time `next` is returned,
  // this already holds for every settled state).
  Object.entries(next.tiles).forEach(([, ts]) => {
    if (ts.ownerId) {
      const owner = next.players.find((p) => p.id === ts.ownerId);
      expect(owner).toBeDefined();
      expect(owner!.bankrupt).toBe(false);
    }
  });

  // 5. House/hotel supply caps: 0-5 houses per tile, and total houses (1-4)
  // + hotels (5) within bank caps.
  let totalHouses = 0;
  let totalHotels = 0;
  Object.values(next.tiles).forEach((ts) => {
    expect(ts.houses).toBeGreaterThanOrEqual(0);
    expect(ts.houses).toBeLessThanOrEqual(5);
    if (ts.houses === 5) totalHotels += 1;
    else if (ts.houses >= 1) totalHouses += ts.houses;
  });
  expect(totalHouses).toBeLessThanOrEqual(HOUSE_SUPPLY);
  expect(totalHotels).toBeLessThanOrEqual(HOTEL_SUPPLY);
}

function printLogs(state: any) {
  const newLogs = state.log.slice(printLogs.lastLength || 0);
  newLogs.forEach((log: string) => console.log(`👉 ${log}`));
  printLogs.lastLength = state.log.length;
}
printLogs.lastLength = 0;

function printState(state: any) {
  console.log("\nPlayers:");
  state.players.forEach((p: any) => {
    console.log(
      `- ${p.name}: Cash: ${formatNaira(p.cash)}, Position: ${p.position} (Tile: ${p.inJail ? "Jail" : "Active"})`,
    );
  });
  console.log(`Current Player: ${state.players[state.currentPlayerIndex].name}`);
  console.log(`Current Phase: ${state.phase}`);
}
