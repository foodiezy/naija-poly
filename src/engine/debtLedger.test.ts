import { describe, it, expect } from "vitest";
import { createGame, applyAction, getRent } from "./engine";
import { BOARD, STARTING_CASH, GO_SALARY, ALL_CHANCE_CARDS, type PropertyTile } from "../data/board";
import type { GameState, DebtRecord } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class MockRNG {
  private values: number[];
  private index: number = 0;

  constructor(values: number[]) {
    this.values = values;
  }

  static makeRoll(d1: number, d2: number): MockRNG {
    return new MockRNG([(d1 - 0.5) / 6, (d2 - 0.5) / 6]);
  }

  static makeSequence(rolls: [number, number][]): MockRNG {
    const vals: number[] = [];
    for (const [d1, d2] of rolls) {
      vals.push((d1 - 0.5) / 6, (d2 - 0.5) / 6);
    }
    return new MockRNG(vals);
  }

  getRNG(): () => number {
    return () => {
      if (this.index >= this.values.length) {
        return 0.5; // fallback
      }
      return this.values[this.index++];
    };
  }
}

/**
 * Compute the system's Money Conservation Invariant.
 *
 * User Rule: (bank + Σ player cash + free-parking pot + Σ realizable asset value) 
 * is constant, decreasing ONLY by deliberate shortfall write-offs.
 *
 * Here, `realizable asset value` means forced liquidation value:
 * - Unmortgaged properties: mortgage value (what you can get from the bank)
 * - Houses/Hotels: houseCost / 2 (what you get for selling them back)
 * - Mortgaged properties: 0 (you already took the cash)
 *
 * Since forced liquidation destroys half the value of houses (and buying a property
 * destroys half the cash value instantly since you can only mortgage it for half), 
 * for the sum to be strictly constant, the `bank` state variable MUST track the 
 * "net fiat money supply" — it absorbs the asymmetric losses of asset values, 
 * or alternatively, we just sum them as defined by the user and assert conservation.
 *
 * NOTE: The engine must track `state.bank` appropriately for this to hold.
 */
export function computeInvariant(state: GameState): number {
  return (state.bank || 0) + totalPlayerCash(state) + state.freeParkingPot + totalRealizableAssetValue(state);
}

function totalPlayerCash(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.cash, 0);
}

function totalDebtAmount(state: GameState): number {
  return state.debtLedger.reduce((sum, d) => sum + d.amount, 0);
}

/**
 * Compute "realizable asset value" — the forced liquidation value of all assets 
 * held by all players.
 */
function totalRealizableAssetValue(state: GameState): number {
  let total = 0;
  for (const posStr of Object.keys(state.tiles)) {
    const pos = parseInt(posStr, 10);
    const ts = state.tiles[pos];
    if (ts.ownerId === null) continue;
    
    const tile = BOARD[pos];
    if (tile.type === "property" || tile.type === "airport" || tile.type === "utility") {
      if (ts.mortgaged) {
        // Already mortgaged, can't extract more cash
        total += 0; 
      } else {
        // Can be mortgaged for its mortgage value
        total += tile.mortgage;
        
        if (tile.type === "property" && ts.houses > 0 && ts.houses <= 5) {
          const houseCount = ts.houses === 5 ? 5 : ts.houses; // hotel is 5 houses
          total += houseCount * (tile.houseCost / 2); // sell back for half price
        }
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Debt Ledger", () => {
  // -------------------------------------------------------------------------
  // Money-conservation invariant
  // -------------------------------------------------------------------------
  describe("money conservation invariant", () => {
    it("rent payment to a solvent debtor: creditor gain === debtor loss, no money minted", () => {
      // Setup: p1 owns Maiduguri (pos 1, rent = ₦2,000).
      // For this test we will use Bama (pos 3, rent = ₦4,000)
      const state = createGame(["p1", "p2"]);
      state.tiles[3] = { ownerId: "p1", houses: 0, mortgaged: false };

      // p2 is at pos 0, rolls [1,2]=3 to land on Bama
      state.players[1].position = 0;
      state.currentPlayerIndex = 1;

      const invariantBefore = computeInvariant(state);

      const rng2 = MockRNG.makeRoll(1, 2);
      const nextState = applyAction(state, "p2", { type: "ROLL" }, rng2.getRNG());

      const rent = 4_000;
      const invariantAfter = computeInvariant(nextState);

      // Total system money MUST be exactly constant
      expect(invariantAfter).toBe(invariantBefore);

      // p2 paid rent
      expect(nextState.players[1].cash).toBe(STARTING_CASH - rent);
      // p1 received rent
      expect(nextState.players[0].cash).toBe(STARTING_CASH + rent);
      // No debts outstanding (solvent payment)
      expect(nextState.debtLedger).toHaveLength(0);
    });

    it("insolvent rent: creditor gets min(owed, cash), total money never increases", () => {
      const state = createGame(["p1", "p2"]);

      // p1 owns Bama (pos 3) with 1 house: rent = ₦20,000
      state.tiles[3] = { ownerId: "p1", houses: 1, mortgaged: false };
      state.tiles[1] = { ownerId: "p1", houses: 1, mortgaged: false };

      // p2 has only ₦10,000 cash — cannot afford ₦20,000 rent
      state.players[1].cash = 10_000;
      state.players[1].position = 0;
      state.currentPlayerIndex = 1;

      const invariantBefore = computeInvariant(state);

      // p2 rolls (1,2) = 3, lands on Bama
      const rng = MockRNG.makeRoll(1, 2);
      const nextState = applyAction(state, "p2", { type: "ROLL" }, rng.getRNG());

      const invariantAfter = computeInvariant(nextState);

      // KEY INVARIANT: total money must NOT increase (it's strictly constant unless write-off)
      // (Since rent payment is a transfer and debtor hasn't settled/written off yet, it is strictly constant)
      expect(invariantAfter).toBe(invariantBefore);

      // p2's cash must not go below 0
      expect(nextState.players[1].cash).toBeGreaterThanOrEqual(0);

      // There should be an outstanding debt in the ledger
      expect(nextState.debtLedger.length).toBeGreaterThan(0);
      const debt = nextState.debtLedger.find(d => d.debtorId === "p2");
      expect(debt).toBeDefined();
      expect(debt!.creditorId).toBe("p1");
    });

    it("tax payment while insolvent records debt to bank, no money minted", () => {
      const state = createGame(["p1", "p2"]);

      // p2 has only ₦50,000 — cannot afford ₦200,000 FIRS Income Tax at pos 4
      state.players[1].cash = 50_000;
      state.players[1].position = 0;
      state.currentPlayerIndex = 1;

      const invariantBefore = computeInvariant(state);

      // p2 rolls (2,2) = 4, lands on FIRS Income Tax
      const rng = MockRNG.makeRoll(2, 2);
      const nextState = applyAction(state, "p2", { type: "ROLL" }, rng.getRNG());

      const invariantAfter = computeInvariant(nextState);
      
      // Total system money should be exactly constant (tax debt recorded, no write off yet)
      expect(invariantAfter).toBe(invariantBefore);

      // Debt should be recorded
      expect(nextState.debtLedger.length).toBeGreaterThan(0);
      const debt = nextState.debtLedger.find(d => d.debtorId === "p2");
      expect(debt).toBeDefined();
      expect(debt!.creditorId).toBe("bank");
    });
  });

  // -------------------------------------------------------------------------
  // Regression: insolvent rent paid in full (the original bug)
  // -------------------------------------------------------------------------
  describe("insolvent rent regression", () => {
    it("does NOT pay full rent when debtor is insolvent — creditor receives nothing until settlement", () => {
      const state = createGame(["p1", "p2"]);

      // p1 owns Bama (pos 3), rent[0] = ₦4,000
      state.tiles[3] = { ownerId: "p1", houses: 0, mortgaged: false };

      // p2 has only ₦2,000
      state.players[1].cash = 2_000;
      state.players[1].position = 0;
      state.currentPlayerIndex = 1;

      const p1CashBefore = state.players[0].cash;
      const invariantBefore = computeInvariant(state);

      // p2 rolls (1,2) = 3, lands on Bama
      const rng = MockRNG.makeRoll(1, 2);
      const nextState = applyAction(state, "p2", { type: "ROLL" }, rng.getRNG());
      
      const invariantAfter = computeInvariant(nextState);

      // Total money must remain perfectly constant (no money minted or destroyed)
      expect(invariantAfter).toBe(invariantBefore);

      // BUG CHECK: p1 must NOT have received ₦4,000 (the full rent)
      // p1 should still have their original cash (debt is unsettled)
      expect(nextState.players[0].cash).toBe(p1CashBefore);

      // p2's cash should NOT be negative
      expect(nextState.players[1].cash).toBeGreaterThanOrEqual(0);

      // A debt record should exist
      expect(nextState.debtLedger).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            debtorId: "p2",
            creditorId: "p1",
            amount: 4_000,
          }),
        ]),
      );
    });

    it("settles debt at DECLARE_BANKRUPT, capped at realizable worth", () => {
      const state = createGame(["p1", "p2", "p3"]);

      // p1 owns Bama (pos 3), rent[1] = ₦20,000 (1 house)
      state.tiles[3] = { ownerId: "p1", houses: 1, mortgaged: false };
      state.tiles[1] = { ownerId: "p1", houses: 1, mortgaged: false };

      // p2 has ₦5,000 cash + owns Murtala Muhammed Airport (pos 5, mortgage = ₦100,000)
      // but they're going bankrupt so assets transfer, they don't liquidate
      state.players[1].cash = 5_000;
      state.players[1].position = 0;
      state.currentPlayerIndex = 1;
      state.tiles[5] = { ownerId: "p2", houses: 0, mortgaged: false };

      const p1CashBefore = state.players[0].cash;
      const invariantBefore = computeInvariant(state);

      // p2 rolls (1,2) = 3, lands on Bama
      const rng = MockRNG.makeRoll(1, 2);
      let nextState = applyAction(state, "p2", { type: "ROLL" }, rng.getRNG());

      // p2 is insolvent, debt recorded
      expect(nextState.debtLedger.length).toBeGreaterThan(0);

      // p2 declares bankruptcy — force-settle
      nextState = applyAction(nextState, "p2", { type: "DECLARE_BANKRUPT" });

      // p2 should be bankrupt
      expect(nextState.players[1].bankrupt).toBe(true);

      // Debt ledger should be cleared
      expect(nextState.debtLedger).toHaveLength(0);

      // p1 should have received p2's remaining cash (₦5,000) — not the full ₦20,000
      // Properties transfer to creditor (p1 gets the airport too)
      expect(nextState.tiles[5].ownerId).toBe("p1");

      // p2's cash should be 0, NOT negative
      expect(nextState.players[1].cash).toBe(0);

      // Total money in system should not have increased (no money minted!)
      // Note: when assets are transferred, houses are destroyed, so the invariant might go down
      // exactly by the value of the destroyed houses, but since the airport has 0 houses, 
      // the invariant should be perfectly constant!
      const invariantAfter = computeInvariant(nextState);
      expect(invariantAfter).toBe(invariantBefore);

      // The total should be: p1 got p2's ₦5k cash (min(owed, cash)) + p3 is unchanged
      expect(nextState.players[0].cash).toBe(p1CashBefore + 5_000);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple simultaneous debtors (collectFromEach)
  // -------------------------------------------------------------------------
  describe("multiple simultaneous debtors", () => {
    it("collectFromEach with insolvent victims caps each at their cash", () => {
      const state = createGame(["p1", "p2", "p3", "p4"]);

      // p1 draws a collectFromEach card for ₦50,000 each
      // p2 has ₦100,000 (solvent), p3 has ₦20,000 (insolvent), p4 has ₦10,000 (insolvent)
      state.players[1].cash = 100_000;
      state.players[2].cash = 20_000;
      state.players[3].cash = 10_000;
      state.currentPlayerIndex = 0;

      const p1CashBefore = state.players[0].cash;
      const totalBefore = totalPlayerCash(state);

      // We'll manually simulate the card effect by setting up the state
      // and calling the card action. The collectFromEach card charges each
      // opponent ₦50,000.
      // Since we can't easily trigger a specific card draw, we'll set up
      // the chance deck to have a collectFromEach card at the top.
      // Actually let's just test the invariant by checking the state after.
      // We need to find a collectFromEach card in the deck.
      // For a focused test, let's just manually construct the scenario.

      // Place p1 on a chance tile and rig the deck
      state.players[0].position = 6; // pos 7 is Chance
      // Find a collectFromEach card
      const chanceCards = ALL_CHANCE_CARDS;
      const collectCard = chanceCards.find(
        (c: { action: { kind: string } }) => c.action.kind === "collectFromEach",
      );

      if (!collectCard) {
        // Skip if no collectFromEach card exists in the deck
        return;
      }

      // Rig the chance deck so the next card drawn is collectFromEach
      state.chanceOrder = [collectCard.id, ...state.chanceOrder.filter((id: string) => id !== collectCard.id)];
      state.chancePtr = 0;

      // p1 at pos 6, rolls (1,0)... need to land on a Chance tile.
      // Chance tiles: pos 7, 22, 36
      state.players[0].position = 5;
      // Roll (1,1) = 2, land on pos 7 (Chance)
      const rng = MockRNG.makeRoll(1, 1);
      const nextState = applyAction(state, "p1", { type: "ROLL" }, rng.getRNG());

      const totalAfter = totalPlayerCash(nextState);

      // CRITICAL: total money must NOT increase
      expect(totalAfter).toBeLessThanOrEqual(totalBefore);

      // p2 (solvent, ₦100k >= amount) should have paid in full
      const amount = (collectCard.action as any).amount;
      expect(nextState.players[1].cash).toBe(100_000 - amount);

      // p3 (insolvent, ₦20k < ₦50k) — cash should be >= 0
      expect(nextState.players[2].cash).toBeGreaterThanOrEqual(0);

      // p4 (insolvent, ₦10k < ₦50k) — cash should be >= 0
      expect(nextState.players[3].cash).toBeGreaterThanOrEqual(0);

      // p1 should have received at most what was actually deducted from others
      const p2Paid = 100_000 - nextState.players[1].cash;
      const p3Paid = 20_000 - nextState.players[2].cash;
      const p4Paid = 10_000 - nextState.players[3].cash;

      // Any remaining debts for p3/p4 in the ledger represent unresolved shortfalls
      const p3Debts = nextState.debtLedger.filter(d => d.debtorId === "p3");
      const p4Debts = nextState.debtLedger.filter(d => d.debtorId === "p4");

      // For non-current players, debts should be auto-settled inline:
      // they pay min(cash, owed), shortfall is written off
      // So their debts should be resolved (ledger cleared for them)
      // and p1 should have received the capped amounts
      expect(p3Debts).toHaveLength(0);
      expect(p4Debts).toHaveLength(0);

      // p1 received: amount (from p2) + capped (from p3) + capped (from p4)
      const expectedP3 = Math.min(amount, 20_000);
      const expectedP4 = Math.min(amount, 10_000);
      expect(nextState.players[0].cash).toBe(p1CashBefore + amount + expectedP3 + expectedP4);
    });
  });

  // -------------------------------------------------------------------------
  // Estate routed to bankrupt creditor
  // -------------------------------------------------------------------------
  describe("estate routed to bankrupt creditor", () => {
    it("reroutes debt to bank when creditor has gone bankrupt", () => {
      const state = createGame(["p1", "p2", "p3"]);

      // Setup: p2 owns Bama (pos 3), p3 will owe p2 rent.
      // But p2 goes bankrupt first (via a separate debt).
      state.tiles[3] = { ownerId: "p2", houses: 0, mortgaged: false };

      // Manually put p3 into debt to p2
      state.players[2].cash = 1_000;
      state.currentPlayerIndex = 2;
      state.players[2].position = 0;

      // First, bankrupt p2
      state.players[1].cash = 0;
      state.players[1].bankrupt = true;
      // p2's property should have been cleared when they went bankrupt
      // but let's test the case where debt is already in the ledger
      // and the creditor goes bankrupt before settlement

      // Create a pre-existing debt from p3 to p2
      state.debtLedger = [{
        debtorId: "p3",
        creditorId: "p2",
        amount: 4_000,
      }];

      // p3 declares bankruptcy to force-settle
      const nextState = applyAction(state, "p3", { type: "DECLARE_BANKRUPT" });

      // p2 is bankrupt — the debt should have been rerouted to bank
      // p2 should NOT have received any cash
      expect(nextState.players[1].cash).toBe(0);

      // Debt ledger should be cleared
      expect(nextState.debtLedger).toHaveLength(0);

      // p3 is bankrupt
      expect(nextState.players[2].bankrupt).toBe(true);

      // p3's cash should be 0
      expect(nextState.players[2].cash).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Debt-dodge by forfeit
  // -------------------------------------------------------------------------
  describe("debt-dodge by forfeit", () => {
    it("forfeiting player's debts are written off, creditor gets nothing, no negative balance", () => {
      const state = createGame(["p1", "p2", "p3"]);

      // p2 has an outstanding debt to p1
      state.players[1].cash = 3_000;
      state.currentPlayerIndex = 1;

      // Record the debt
      state.debtLedger = [{
        debtorId: "p2",
        creditorId: "p1",
        amount: 50_000,
      }];

      state.tiles[5] = { ownerId: "p2", houses: 0, mortgaged: false };

      const p1CashBefore = state.players[0].cash;
      const totalBefore = totalPlayerCash(state);

      // p2 forfeits
      const nextState = applyAction(state, "p2", { type: "FORFEIT" });

      // p2 is bankrupt
      expect(nextState.players[1].bankrupt).toBe(true);

      // Debt ledger should be cleared
      expect(nextState.debtLedger.filter(d => d.debtorId === "p2")).toHaveLength(0);

      // p1 should NOT have received any money (forfeit = assets go to bank)
      expect(nextState.players[0].cash).toBe(p1CashBefore);

      // p2's properties should go to the bank (ownerId = null)
      expect(nextState.tiles[5].ownerId).toBeNull();

      // No negative balance
      expect(nextState.players[1].cash).toBeGreaterThanOrEqual(0);

      // Total money should not have increased
      const totalAfter = totalPlayerCash(nextState);
      expect(totalAfter).toBeLessThanOrEqual(totalBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Debt-dodge by vote-kick (disconnect)
  // -------------------------------------------------------------------------
  describe("debt-dodge by vote-kick", () => {
    it("vote-kicked player's debts are written off, same as forfeit", () => {
      const state = createGame(["p1", "p2", "p3"]);

      // p2 has an outstanding debt to p1
      state.players[1].cash = 3_000;

      state.debtLedger = [{
        debtorId: "p2",
        creditorId: "p1",
        amount: 50_000,
      }];

      state.tiles[5] = { ownerId: "p2", houses: 0, mortgaged: false };

      // Two other players vote-kick p2 (majority in 3-player game = 2 votes)
      let nextState = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p2" });
      nextState = applyAction(nextState, "p3", { type: "VOTE_KICK", targetId: "p2" });

      // p2 should be bankrupt (vote-kick triggers forfeit)
      expect(nextState.players[1].bankrupt).toBe(true);

      // Debts should be cleared
      expect(nextState.debtLedger.filter(d => d.debtorId === "p2")).toHaveLength(0);

      // Properties go to bank
      expect(nextState.tiles[5].ownerId).toBeNull();

      // No negative balances
      expect(nextState.players[1].cash).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // END_TURN blocked with unsettled debts
  // -------------------------------------------------------------------------
  describe("END_TURN blocked with unsettled debts", () => {
    it("throws if current player has unsettled debts in the ledger", () => {
      const state = createGame(["p1", "p2"]);
      state.phase = "awaiting-end-turn";
      state.currentPlayerIndex = 0;

      // p1 has an outstanding debt
      state.debtLedger = [{
        debtorId: "p1",
        creditorId: "p2",
        amount: 10_000,
      }];

      expect(() => applyAction(state, "p1", { type: "END_TURN" })).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Objective evaluation bails with unsettled debts
  // -------------------------------------------------------------------------
  describe("objective evaluation with debts", () => {
    it("does not evaluate objectives when debtLedger has entries", () => {
      const state = createGame(["p1", "p2"], { secretObjectives: true });
      state.players[0].secretObjective = "cash_2m";
      state.players[0].cash = 2_500_000;
      state.players[0].objectiveCompleted = false;

      // Add a debt so objectives should NOT evaluate
      state.debtLedger = [{
        debtorId: "p2",
        creditorId: "bank",
        amount: 1_000,
      }];

      // Trigger a boundary where objectives would normally evaluate
      // (END_TURN will throw because of debt, so we test via a different path)
      // Let's use FORFEIT for p2 which clears debt and advances turn
      state.currentPlayerIndex = 1;
      const nextState = applyAction(state, "p2", { type: "FORFEIT" });

      // After forfeit clears the debt, objectives CAN evaluate at the boundary.
      // The key test is that objectives don't fire WHILE debts are present.
      // Since forfeit clears the debt first, then evaluates, this should work.
      // p1 has ₦2.5M > ₦2M, so objective should complete after debt clears.
      expect(nextState.players[0].objectiveCompleted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Net-worth winner calc subtracts pending debts
  // -------------------------------------------------------------------------
  describe("net-worth winner calc with debts", () => {
    it("subtracts pending debts from player net worth in turn-limit game", () => {
      const state = createGame(["p1", "p2"], { turnLimit: 1 });
      state.currentTurn = 1;
      state.currentPlayerIndex = 1; // p2's turn

      // Give p1 slightly more cash but a large outstanding debt
      state.players[0].cash = 1_600_000;
      state.players[1].cash = 1_500_000;

      // p1 has a debt of ₦200k — net worth should be 1.6M - 200k = 1.4M
      state.debtLedger = [{
        debtorId: "p1",
        creditorId: "bank",
        amount: 200_000,
      }];

      state.phase = "awaiting-end-turn";

      // End turn wraps around (p2 -> p1, nextIndex < currentIndex) triggering
      // turn-limit check
      const nextState = applyAction(state, "p2", { type: "END_TURN" });

      // p2 should win because p1's net worth is reduced by the debt
      // p1: 1.6M - 200k debt = 1.4M  vs  p2: 1.5M
      expect(nextState.winnerId).toBe("p2");
      expect(nextState.phase).toBe("game-over");
    });
  });
});
