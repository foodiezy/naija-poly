import { describe, it, expect } from "vitest";
import {
  createGame,
  applyAction,
  computeNetWorth,
  defaultChaosResolution,
  pendingChaosDecider,
} from "./engine";
import {
  BOARD,
  STARTING_CASH,
  GENERATOR_COST,
  STOCKPILE_PER_HOUSE,
  STOCKPILE_PER_HOTEL,
  STOCKPILE_MULTIPLIER,
  FIRE_SALE_DISCOUNT_PCT,
  EFCC_SETTLEMENT,
  CHAOS_CHANCE_CARDS,
  type PropertyTile,
} from "../data/board";
import type { GameState } from "./types";

// Deterministic RNG yielding the requested two dice, then 0.5 forever.
function rollRng(d1: number, d2: number): () => number {
  const vals = [(d1 - 0.5) / 6, (d2 - 0.5) / 6];
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0.5);
}

// Force the current player to draw a specific chaos card: seed the deck, park
// them on pos 4, and roll (1,2)=3 onto the Chance tile at pos 7 (non-doubles).
function drawChaos(state: GameState, cardId: string): GameState {
  const cur = state.players[state.currentPlayerIndex];
  state.chanceOrder = [cardId];
  state.chancePtr = 0;
  cur.position = 4;
  return applyAction(state, cur.id, { type: "ROLL" }, rollRng(1, 2));
}

// Roll `playerId` from pos 0 onto `targetPos` (choose a non-doubles pair).
function landFromStart(state: GameState, playerId: string, d1: number, d2: number): GameState {
  const p = state.players.find((x) => x.id === playerId)!;
  p.position = 0;
  state.currentPlayerIndex = state.players.indexOf(p);
  state.phase = "awaiting-roll";
  state.dice = null;
  state.doublesCount = 0;
  return applyAction(state, playerId, { type: "ROLL" }, rollRng(d1, d2));
}

function own(state: GameState, pos: number, playerId: string, houses = 0): void {
  state.tiles[pos] = { ownerId: playerId, houses, mortgaged: false };
}

const priciest = (): PropertyTile =>
  BOARD.reduce<PropertyTile | null>((best, t) => {
    if (t.type !== "property") return best;
    return !best || t.price > best.price ? t : best;
  }, null)!;

describe("Chaos Mode redesign — core five (C1–C5)", () => {
  // ===========================================================================
  // C1 — NEPA Load-Shedding (aimable blackout)
  // ===========================================================================
  describe("C1 aimable blackout", () => {
    it("opens the zone picker for the drawer, offering only zones with collectible rent", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1"); // brown, collectible
      own(state, 6, "p2"); // lightblue, collectible
      state.tiles[8] = { ownerId: "p2", houses: 0, mortgaged: true }; // mortgaged → not collectible

      const s = drawChaos(state, "cx01");
      expect(s.phase).toBe("awaiting-blackout-target");
      expect(s.pendingBlackout?.drawerId).toBe("p1");
      expect([...(s.pendingBlackout?.selectableZones ?? [])].sort()).toEqual(["brown", "lightblue"]);
      expect(s.blackout).toBeNull(); // dark only after a zone is chosen
    });

    it("darkens only the chosen zone; other zones still collect rent", () => {
      const base = createGame(["p1", "p2"], { chaosMode: true });
      own(base, 3, "p1"); // brown — will go dark (partial group → no rent doubling)
      own(base, 6, "p1"); // lightblue — stays lit
      base.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };

      const brownRent = (BOARD[3] as PropertyTile).rent[0];
      const lightblueRent = (BOARD[6] as PropertyTile).rent[0];
      expect(brownRent).toBeGreaterThan(0);
      expect(lightblueRent).toBeGreaterThan(0);

      // p2 lands on the darkened brown tile (pos 3, via 1+2) → pays nothing.
      const dark = landFromStart(structuredClone(base), "p2", 1, 2);
      expect(dark.players[1].position).toBe(3);
      expect(dark.players[1].cash).toBe(STARTING_CASH);
      expect(dark.players[0].cash).toBe(STARTING_CASH);

      // p2 lands on the lit lightblue tile (pos 6, via 2+4) → pays rent.
      const lit = landFromStart(structuredClone(base), "p2", 2, 4);
      expect(lit.players[1].position).toBe(6);
      expect(lit.players[1].cash).toBe(STARTING_CASH - lightblueRent);
      expect(lit.players[0].cash).toBe(STARTING_CASH + lightblueRent);
    });

    it("expires when the round wraps back around", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 3, "p1");
      state.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };
      state.currentPlayerIndex = 1;
      state.phase = "awaiting-end-turn";
      state.doublesCount = 0;

      const s = applyAction(state, "p2", { type: "END_TURN" });
      expect(s.currentTurn).toBe(2);
      expect(s.blackout).toBeNull();
    });

    it("rejects a non-drawer chooser and an unlistable zone", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1");
      const s = drawChaos(state, "cx01");
      expect(() => applyAction(s, "p2", { type: "CHOOSE_BLACKOUT_ZONE", zone: "brown" })).toThrow();
      expect(() => applyAction(s, "p1", { type: "CHOOSE_BLACKOUT_ZONE", zone: "green" })).toThrow();
    });

    it("fizzles gracefully when no zone qualifies (aimed card, no legal target)", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      const s = drawChaos(state, "cx01"); // nobody owns property
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.blackout).toBeNull();
      expect(s.pendingBlackout).toBeNull();
    });
  });

  // ===========================================================================
  // C1 + C2 — matched pair: a blacked-out leader has a real decision
  // ===========================================================================
  describe("C1+C2 matched pair — the leader can defend with a generator", () => {
    it("a blacked-out leader who fuels a generator keeps collecting rent (not a passive loss)", () => {
      const base = createGame(["p1", "p2"], { chaosMode: true });
      own(base, 3, "p1"); // leader's brown property
      base.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };
      const rent = (BOARD[3] as PropertyTile).rent[0];

      // The leader makes the decision: pay for a generator.
      const s = applyAction(base, "p1", { type: "BUY_GENERATOR" });
      expect(s.players[0].cash).toBe(STARTING_CASH - GENERATOR_COST);
      expect(s.blackout?.generatorOwners).toContain("p1");

      // A rival lands on the leader's still-lit brown tile → pays rent.
      const paid = landFromStart(s, "p2", 1, 2);
      expect(paid.players[1].position).toBe(3);
      expect(paid.players[1].cash).toBe(STARTING_CASH - rent);
      expect(paid.players[0].cash).toBe(STARTING_CASH - GENERATOR_COST + rent);
    });

    it("without a generator the same landing collects nothing (proves the decision mattered)", () => {
      const base = createGame(["p1", "p2"], { chaosMode: true });
      own(base, 3, "p1");
      base.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };
      const noGen = landFromStart(structuredClone(base), "p2", 1, 2);
      expect(noGen.players[1].cash).toBe(STARTING_CASH); // rival paid nothing
      expect(noGen.players[0].cash).toBe(STARTING_CASH); // leader collected nothing
    });
  });

  // ===========================================================================
  // C2 — "I Get Generator!"
  // ===========================================================================
  describe("C2 generator buyout", () => {
    it("only exempts the buyer; a non-buying owner in the same zone stays dark", () => {
      const rent = (BOARD[3] as PropertyTile).rent[0]; // brown pos 3, partial group

      // Scenario A: the tile's owner (p1) fuels a generator → tenant pays.
      const withGen = createGame(["p1", "p2"], { chaosMode: true });
      own(withGen, 3, "p1");
      withGen.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };
      const lit = landFromStart(
        applyAction(withGen, "p1", { type: "BUY_GENERATOR" }),
        "p2",
        1,
        2,
      );
      expect(lit.players[1].position).toBe(3);
      expect(lit.players[1].cash).toBe(STARTING_CASH - rent);
      expect(lit.players[0].cash).toBe(STARTING_CASH - GENERATOR_COST + rent);

      // Scenario B: same zone, same tile, but the owner did NOT buy → still dark.
      const noGen = createGame(["p1", "p2"], { chaosMode: true });
      own(noGen, 3, "p1");
      noGen.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };
      const dark = landFromStart(noGen, "p2", 1, 2);
      expect(dark.players[1].cash).toBe(STARTING_CASH);
      expect(dark.players[0].cash).toBe(STARTING_CASH);
    });

    it("rejects a non-owner, an owner with no un-mortgaged tile, and a double purchase", () => {
      const base = createGame(["p1", "p2"], { chaosMode: true });
      own(base, 3, "p1");
      base.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };

      expect(() => applyAction(base, "p2", { type: "BUY_GENERATOR" })).toThrow(); // p2 owns nothing in zone

      const mortgaged = structuredClone(base);
      mortgaged.tiles[3] = { ownerId: "p1", houses: 0, mortgaged: true };
      expect(() => applyAction(mortgaged, "p1", { type: "BUY_GENERATOR" })).toThrow();

      const bought = applyAction(base, "p1", { type: "BUY_GENERATOR" });
      expect(() => applyAction(bought, "p1", { type: "BUY_GENERATOR" })).toThrow(); // already bought
    });

    it("a generator offered to an owner who can't afford it is rejected; rent stays waived", () => {
      const base = createGame(["p1", "p2"], { chaosMode: true });
      own(base, 3, "p1");
      base.players[0].cash = GENERATOR_COST - 1; // can't afford
      base.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };

      expect(() => applyAction(base, "p1", { type: "BUY_GENERATOR" })).toThrow();
      // The zone is still dark for p1, and p1 was never charged.
      const landed = landFromStart(structuredClone(base), "p2", 1, 2);
      expect(landed.players[0].cash).toBe(GENERATOR_COST - 1);
      expect(landed.players[1].cash).toBe(STARTING_CASH); // still no rent
    });

    it("buying a generator never drives the buyer negative (bankruptcy can't be triggered by the buyout)", () => {
      const base = createGame(["p1", "p2"], { chaosMode: true });
      own(base, 3, "p1");
      base.players[0].cash = GENERATOR_COST; // exactly enough
      base.blackout = { untilRound: 2, zone: "brown", generatorOwners: [] };
      const s = applyAction(base, "p1", { type: "BUY_GENERATOR" });
      expect(s.players[0].cash).toBe(0);
      expect(s.players[0].cash).toBeGreaterThanOrEqual(0);
      expect(s.players[0].bankrupt).toBe(false);
    });
  });

  // ===========================================================================
  // C3 — Fuel Queue Stockpile
  // ===========================================================================
  describe("C3 fuel queue stockpile", () => {
    it("take-now pays the building income immediately", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1", 2); // 2 houses
      own(state, 3, "p1", 3); // 3 houses → 5 houses total
      const expected = 5 * STOCKPILE_PER_HOUSE;

      let s = drawChaos(state, "cx03");
      expect(s.phase).toBe("awaiting-stockpile-choice");
      expect(s.pendingStockpile?.amount).toBe(expected);

      s = applyAction(s, "p1", { type: "CHOOSE_STOCKPILE", mode: "now" });
      expect(s.players[0].cash).toBe(STARTING_CASH + expected);
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.deferredPayouts).toEqual([]);
    });

    it("double pays out 2x on the next round wrap", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1", 0);
      state.tiles[1] = { ownerId: "p1", houses: 5, mortgaged: false }; // a hotel
      const now = STOCKPILE_PER_HOTEL;

      let s = drawChaos(state, "cx03");
      expect(s.pendingStockpile?.amount).toBe(now);

      s = applyAction(s, "p1", { type: "CHOOSE_STOCKPILE", mode: "double" });
      expect(s.players[0].cash).toBe(STARTING_CASH); // nothing now
      expect(s.deferredPayouts).toHaveLength(1);
      expect(s.deferredPayouts?.[0]).toMatchObject({
        playerId: "p1",
        amount: now * STOCKPILE_MULTIPLIER,
        dueRound: 2,
      });

      // Force a round wrap: hand the turn to the last player and end it.
      s.currentPlayerIndex = 1;
      s.phase = "awaiting-end-turn";
      s.doublesCount = 0;
      s = applyAction(s, "p2", { type: "END_TURN" });
      expect(s.currentTurn).toBe(2);
      expect(s.players[0].cash).toBe(STARTING_CASH + now * STOCKPILE_MULTIPLIER);
      expect(s.deferredPayouts).toEqual([]);
    });

    it("fizzles when the drawer has no buildings (nothing to stockpile)", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1", 0); // owned but no houses
      const s = drawChaos(state, "cx03");
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.pendingStockpile).toBeNull();
    });

    it("rejects a stockpile choice from anyone but the drawer", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1", 2);
      const s = drawChaos(state, "cx03");
      expect(() => applyAction(s, "p2", { type: "CHOOSE_STOCKPILE", mode: "now" })).toThrow();
    });
  });

  // ===========================================================================
  // C4 — Government Fire Sale
  // ===========================================================================
  describe("C4 government fire sale", () => {
    it("buys a chosen unowned tile at the discount and assigns ownership", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      const target = priciest();
      const expectedCost = Math.floor((target.price * (100 - FIRE_SALE_DISCOUNT_PCT)) / 100);

      let s = drawChaos(state, "cx04");
      expect(s.phase).toBe("awaiting-firesale-pick");
      expect(s.pendingFireSale?.discountPct).toBe(FIRE_SALE_DISCOUNT_PCT);
      expect(s.pendingFireSale?.eligibleTiles).toContain(target.pos);

      s = applyAction(s, "p1", { type: "CHOOSE_FIRESALE_TILE", pos: target.pos });
      expect(s.players[0].cash).toBe(STARTING_CASH - expectedCost);
      expect(s.tiles[target.pos].ownerId).toBe("p1");
      expect(s.stats["p1"].propertiesBought).toBe(1);
      expect(s.phase).toBe("awaiting-end-turn");
    });

    it("declining clears the fire sale cleanly", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      let s = drawChaos(state, "cx04");
      s = applyAction(s, "p1", { type: "DECLINE_FIRESALE" });
      expect(s.pendingFireSale).toBeNull();
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.players[0].cash).toBe(STARTING_CASH);
    });

    it("rejects buying an owned or otherwise ineligible tile", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p2"); // already owned → not eligible
      const s = drawChaos(state, "cx04");
      expect(() => applyAction(s, "p1", { type: "CHOOSE_FIRESALE_TILE", pos: 1 })).toThrow();
    });

    it("resolves gracefully with no softlock when no unowned tiles remain", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      // p1 owns every ownable tile.
      for (const t of BOARD) {
        if (t.type === "property" || t.type === "airport" || t.type === "utility") {
          own(state, t.pos, "p1");
        }
      }
      const s = drawChaos(state, "cx04");
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.pendingFireSale).toBeNull();
    });

    it("insufficient cash is rejected, but the drawer can still decline (no softlock)", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      state.players[0].cash = 10; // can't afford anything
      const s = drawChaos(state, "cx04");
      const cheapProperty = BOARD.find((t) => t.type === "property") as PropertyTile;
      expect(() =>
        applyAction(s, "p1", { type: "CHOOSE_FIRESALE_TILE", pos: cheapProperty.pos }),
      ).toThrow();
      const declined = applyAction(s, "p1", { type: "DECLINE_FIRESALE" });
      expect(declined.phase).toBe("awaiting-end-turn");
    });
  });

  // ===========================================================================
  // C5 — EFCC Settlement
  // ===========================================================================
  describe("C5 EFCC settlement", () => {
    it("targets the richest player and opens the pay-or-surrender choice", () => {
      const state = createGame(["p1", "p2", "p3"], { chaosMode: true });
      state.players[2].cash = STARTING_CASH + 1_000_000; // p3 richest
      const s = drawChaos(state, "cx05");
      expect(s.phase).toBe("awaiting-efcc-choice");
      expect(s.pendingEfcc?.targetId).toBe("p3");
      expect(s.pendingEfcc?.cashAmount).toBe(EFCC_SETTLEMENT);
    });

    it("routes the decision to a non-current player, who can pay out of turn", () => {
      const state = createGame(["p1", "p2", "p3"], { chaosMode: true });
      state.players[2].cash = STARTING_CASH + 1_000_000; // p3 richest, but p1 is rolling
      let s = drawChaos(state, "cx05");
      expect(s.currentPlayerIndex).toBe(0); // still p1's turn
      expect(s.pendingEfcc?.targetId).toBe("p3");

      s = applyAction(s, "p3", { type: "EFCC_PAY_CASH" });
      expect(s.players[2].cash).toBe(STARTING_CASH + 1_000_000 - EFCC_SETTLEMENT);
      expect(s.currentPlayerIndex).toBe(0); // turn never left p1
      expect(s.phase).toBe("awaiting-end-turn");
      expect(() => applyAction(s, "p1", { type: "EFCC_PAY_CASH" })).toThrow(); // already resolved
    });

    it("surrender returns a chosen property to the bank", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      const target = priciest();
      own(state, target.pos, "p1"); // p1 rich (starting cash + property) → clears threshold
      state.players[1].cash = 200_000;
      let s = drawChaos(state, "cx05");
      expect(s.pendingEfcc?.targetId).toBe("p1");
      expect(s.pendingEfcc?.surrenderableTiles).toContain(target.pos);

      s = applyAction(s, "p1", { type: "EFCC_SURRENDER", pos: target.pos });
      expect(s.tiles[target.pos].ownerId).toBeNull();
      expect(s.players[0].cash).toBe(STARTING_CASH); // cash untouched
      expect(s.phase).toBe("awaiting-end-turn");
    });

    it("breaks a tie for richest by turn order (lowest index)", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      // Equal cash, no property → equal net worth, both above threshold.
      const s = drawChaos(state, "cx05");
      expect(s.pendingEfcc?.targetId).toBe("p1");
    });

    it("when the richest has no property, surrender is illegal and they must pay cash", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      state.players[0].cash = STARTING_CASH; // richest, owns nothing
      state.players[1].cash = 200_000;
      let s = drawChaos(state, "cx05");
      expect(s.pendingEfcc?.targetId).toBe("p1");
      expect(s.pendingEfcc?.surrenderableTiles).toEqual([]);
      expect(() => applyAction(s, "p1", { type: "EFCC_SURRENDER", pos: 1 })).toThrow();
      s = applyAction(s, "p1", { type: "EFCC_PAY_CASH" });
      expect(s.players[0].cash).toBe(STARTING_CASH - EFCC_SETTLEMENT);
    });

    it("fizzles when nobody clears the richest threshold", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      state.players[0].cash = 100_000;
      state.players[1].cash = 100_000;
      const s = drawChaos(state, "cx05");
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.pendingEfcc).toBeNull();
    });

    it("handles bankruptcy mid-settlement when the target can't pay (game continues)", () => {
      const state = createGame(["p1", "p2", "p3"], { chaosMode: true });
      // p1 is richest via property value (well over the ₦1M threshold) but is
      // cash-poor: it cannot cover the settlement in cash.
      own(state, 37, "p1"); // Victoria Island (₦350k)
      own(state, 39, "p1"); // Ikoyi (₦400k)
      own(state, 31, "p1"); // a green tile (≥ ₦300k)
      state.players[0].cash = 100_000; // < EFCC_SETTLEMENT
      state.players[1].cash = 300_000;
      state.players[2].cash = 300_000;

      let s = drawChaos(state, "cx05");
      expect(s.pendingEfcc?.targetId).toBe("p1");

      // p1 chooses cash but can't cover it → a debt is ledgered.
      s = applyAction(s, "p1", { type: "EFCC_PAY_CASH" });
      expect(s.debtLedger.some((d) => d.debtorId === "p1")).toBe(true);

      // p1 declares bankruptcy; with 3 players the game continues.
      s = applyAction(s, "p1", { type: "DECLARE_BANKRUPT" });
      expect(s.players[0].bankrupt).toBe(true);
      expect(s.winnerId).toBeNull();
      expect(s.phase).toBe("awaiting-roll");
    });
  });

  // ===========================================================================
  // Cross-cutting: net worth helper, safe defaults, and the no-softlock invariant
  // ===========================================================================
  describe("helpers and the no-softlock invariant", () => {
    it("computeNetWorth counts cash plus property value", () => {
      const state = createGame(["p1", "p2"]);
      const t = priciest();
      own(state, t.pos, "p1");
      expect(computeNetWorth(state, "p1")).toBe(STARTING_CASH + t.price);
    });

    it("pendingChaosDecider and defaultChaosResolution agree on the live decision", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      own(state, 1, "p1");
      const s = drawChaos(state, "cx01");
      expect(pendingChaosDecider(s)).toBe("p1");
      expect(defaultChaosResolution(s)).toEqual({ type: "CHOOSE_BLACKOUT_ZONE", zone: "brown" });
      expect(defaultChaosResolution(createGame(["p1", "p2"]))).toBeNull();
    });

    it("every chaos card resolves to a non-stuck phase (no softlock)", () => {
      for (const card of CHAOS_CHANCE_CARDS) {
        // A board rich enough that no card fizzles for lack of a target.
        const state = createGame(["p1", "p2", "p3"], { chaosMode: true });
        own(state, 1, "p1", 2); // buildings for stockpile
        own(state, 3, "p1", 2);
        own(state, 6, "p2"); // another zone for blackout
        state.players[0].cash = STARTING_CASH; // clears EFCC threshold

        let s = drawChaos(state, card.id);
        // If the card opened a decision, auto-resolve it with the safe default.
        const decider = pendingChaosDecider(s);
        if (decider) {
          const fallback = defaultChaosResolution(s);
          expect(fallback).not.toBeNull();
          s = applyAction(s, decider, fallback!);
        }
        // Play must always be able to continue.
        expect(pendingChaosDecider(s)).toBeNull();
        expect(["awaiting-end-turn", "awaiting-buy-decision", "game-over"]).toContain(s.phase);
      }
    });
  });
});
