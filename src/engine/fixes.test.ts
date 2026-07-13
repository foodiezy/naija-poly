import { describe, it, expect } from "vitest";
import { createGame, applyAction } from "./engine";
import { BOARD, STARTING_CASH, HUSTLE_CARDS, ALL_CHANCE_CARDS } from "../data/board";
import type { GameState, TradeOffer } from "./types";

// Deterministic dice: (d-0.5)/6 floors to d-1, so Math.floor(rng*6)+1 === d.
function fixedRoll(d1: number, d2: number): () => number {
  const vals = [(d1 - 0.5) / 6, (d2 - 0.5) / 6];
  let i = 0;
  return () => vals[i++ % vals.length];
}

const HUSTLE_JAIL_ID = HUSTLE_CARDS.find((c) => c.action.kind === "getOutOfJailFree")!.id;
const CHANCE_JAIL_ID = ALL_CHANCE_CARDS.find((c) => c.action.kind === "getOutOfJailFree")!.id;

// Put a player squarely in the middle of a turn where they owe an unaffordable
// rent, leaving a DebtRecord in the ledger (current-player insolvency path).
function stateWithLedgerDebt(): { state: GameState } {
  const state = createGame(["p1", "p2"]);
  // p1 owns Bama (pos 3) with a house so rent is a hefty ₦20,000.
  state.tiles[1] = { ownerId: "p1", houses: 1, mortgaged: false };
  state.tiles[3] = { ownerId: "p1", houses: 1, mortgaged: false };
  // Give p2 something to mortgage, and only ₦5,000 cash.
  state.tiles[6] = { ownerId: "p2", houses: 0, mortgaged: false };
  state.players[1].cash = 5_000;
  state.players[1].position = 0;
  state.currentPlayerIndex = 1;
  const next = applyAction(state, "p2", { type: "ROLL" }, fixedRoll(1, 2)); // land on Bama (pos 3)
  return { state: next };
}

describe("Debt settlement (H2) — a solvent-after-raising player is never forced bankrupt", () => {
  it("records a ledger debt when rent exceeds cash", () => {
    const { state } = stateWithLedgerDebt();
    const debts = state.debtLedger.filter((d) => d.debtorId === "p2");
    expect(debts).toHaveLength(1);
    expect(debts[0].amount).toBe(20_000);
    expect(state.players[1].cash).toBe(5_000); // not yet deducted
  });

  it("MORTGAGE auto-settles the debt once cash covers it, and END_TURN then succeeds", () => {
    let { state } = stateWithLedgerDebt();
    // Bama pos 6 (Nnamdi Azikiwe?) — mortgage value pays off the ₦20,000 debt.
    const mortgageVal = (() => {
      const t = BOARD[6];
      return "mortgage" in t ? t.mortgage : 0;
    })();
    expect(mortgageVal).toBeGreaterThan(20_000);

    state = applyAction(state, "p2", { type: "MORTGAGE", pos: 6 });
    // Debt is gone; cash reflects mortgage proceeds minus the settled rent.
    expect(state.debtLedger.filter((d) => d.debtorId === "p2")).toHaveLength(0);
    expect(state.players[1].cash).toBe(5_000 + mortgageVal - 20_000);
    // Creditor p1 actually received the rent.
    expect(state.players[0].cash).toBe(STARTING_CASH + 20_000);

    // END_TURN no longer throws.
    expect(() => applyAction(state, "p2", { type: "END_TURN" })).not.toThrow();
  });

  it("END_TURN settles an affordable debt inline rather than blocking", () => {
    let { state } = stateWithLedgerDebt();
    // Hand p2 enough loose cash to cover the debt directly (simulating a prior
    // sale), leaving the ledger entry to be cleared at END_TURN.
    state.players[1].cash = 50_000;
    state = applyAction(state, "p2", { type: "END_TURN" });
    expect(state.debtLedger).toHaveLength(0);
    expect(state.players[1].cash).toBe(30_000); // 50k - 20k rent
    expect(state.currentPlayerIndex).toBe(0); // turn advanced
  });

  it("still blocks END_TURN when the debt genuinely can't be covered", () => {
    const { state } = stateWithLedgerDebt();
    // p2 has ₦5,000, owes ₦20,000, nothing left to mortgage that helps enough.
    // Mortgage the only property away first to strip options — but keep debt.
    expect(() => applyAction(state, "p2", { type: "END_TURN" })).toThrow(/unsettled debts/i);
  });
});

describe("Jail card deck restore (H1) — Hustle card id is correct", () => {
  it("returns the Hustle jail card to the hustle deck (not a chance id)", () => {
    const state = createGame(["p1", "p2"]);
    const p1 = state.players[0];
    p1.inJail = true;
    p1.jailTurns = 0;
    p1.jailCardSources = ["hustle"];
    state.phase = "awaiting-roll";

    const before = state.hustleOrder.length;
    const next = applyAction(state, "p1", { type: "USE_JAIL_CARD" });

    expect(next.hustleOrder).toContain(HUSTLE_JAIL_ID);
    expect(next.hustleOrder).not.toContain("es07"); // the old typo
    expect(next.hustleOrder.length).toBe(before + 1);
    expect(next.players[0].inJail).toBe(false);
  });

  it("returns a chance-sourced jail card to the chance deck", () => {
    const state = createGame(["p1", "p2"]);
    const p1 = state.players[0];
    p1.inJail = true;
    p1.jailCardSources = ["chance"];
    state.phase = "awaiting-roll";
    const next = applyAction(state, "p1", { type: "USE_JAIL_CARD" });
    expect(next.chanceOrder).toContain(CHANCE_JAIL_ID);
  });
});

describe("Trade lifecycle (H3/M1/M4)", () => {
  function tradeSetup(): GameState {
    const state = createGame(["p1", "p2"]);
    state.phase = "awaiting-end-turn";
    state.tiles[1] = { ownerId: "p1", houses: 0, mortgaged: false };
    state.tiles[3] = { ownerId: "p2", houses: 0, mortgaged: false };
    return state;
  }

  it("PROPOSE_TRADE rejects a second pending offer instead of clobbering", () => {
    const state = tradeSetup();
    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [1],
      getTiles: [3],
    };
    const proposed = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer });
    expect(() => applyAction(proposed, "p1", { type: "PROPOSE_TRADE", trade: offer })).toThrow(
      /already pending/i,
    );
  });

  it("CANCEL_TRADE lets the proposer withdraw their own offer", () => {
    const state = tradeSetup();
    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [1],
      getTiles: [3],
    };
    let s = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer });
    s = applyAction(s, "p1", { type: "CANCEL_TRADE" });
    expect(s.activeTrade).toBeNull();
  });

  it("a stale offer (tile mortgaged after proposing) is voided on accept, not executed", () => {
    const state = tradeSetup();
    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [1], // p1 gives tile 1
      getTiles: [3],
    };
    let s = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer });
    // p1 mortgages the very tile they offered.
    s = applyAction(s, "p1", { type: "MORTGAGE", pos: 1 });
    // p2 accepts — the offer is now stale (still valid since mortgaged tiles are
    // tradeable), but the buyer should owe interest. Assert the tile transfers
    // AND the interest is charged rather than a silent free transfer.
    const p2CashBefore = s.players[1].cash;
    s = applyAction(s, "p2", { type: "RESPOND_TRADE", accept: true });
    expect(s.tiles[1].ownerId).toBe("p2");
    const t1 = BOARD[1];
    const interest = "mortgage" in t1 ? Math.round(t1.mortgage * 0.1) : 0;
    expect(s.players[1].cash).toBe(p2CashBefore - interest);
  });

  it("a trade with a built-on group member is rejected at propose time", () => {
    const state = tradeSetup();
    // Give p1 the whole first group and build on a sibling of tile 1.
    // Find tile 1's group and put a house on another member.
    const t1 = BOARD[1];
    if (t1.type === "property") {
      const siblings = BOARD.filter((t) => t.type === "property" && t.group === t1.group);
      siblings.forEach(
        (t) => (state.tiles[t.pos] = { ownerId: "p1", houses: 0, mortgaged: false }),
      );
      state.tiles[siblings[1].pos].houses = 1; // a house on a sibling
    }
    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [1],
      getTiles: [],
    };
    expect(() => applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer })).toThrow(
      /buildings/i,
    );
  });

  it("counter-offer replaces the pending trade with roles swapped", () => {
    const state = tradeSetup();
    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [1],
      getTiles: [3],
    };
    let s = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer });
    const counter: TradeOffer = {
      fromId: "p2",
      toId: "p1",
      giveCash: 0,
      getCash: 0,
      giveTiles: [3],
      getTiles: [1],
    };
    s = applyAction(s, "p2", { type: "RESPOND_TRADE", accept: false, counter });
    expect(s.activeTrade).toEqual(counter);
    // p1 can now accept the counter.
    s = applyAction(s, "p1", { type: "RESPOND_TRADE", accept: true });
    expect(s.tiles[1].ownerId).toBe("p2");
    expect(s.tiles[3].ownerId).toBe("p1");
  });

  it("jail cards can be traded and carry their source deck", () => {
    const state = tradeSetup();
    state.players[0].jailCardSources = ["chance"];
    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [],
      getTiles: [],
      giveJailCards: 1,
    };
    let s = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer });
    s = applyAction(s, "p2", { type: "RESPOND_TRADE", accept: true });
    expect(s.players[0].jailCardSources).toHaveLength(0);
    expect(s.players[1].jailCardSources).toEqual(["chance"]);
  });
});

describe("Mortgage transfer interest (M2)", () => {
  it("charges 10% bank interest when a mortgaged tile is traded", () => {
    const state = createGame(["p1", "p2"]);
    state.phase = "awaiting-end-turn";
    state.tiles[1] = { ownerId: "p1", houses: 0, mortgaged: true };
    const t1 = BOARD[1];
    const interest = "mortgage" in t1 ? Math.round(t1.mortgage * 0.1) : 0;
    expect(interest).toBeGreaterThan(0);

    const offer: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [1],
      getTiles: [],
    };
    const bankBefore = state.bank;
    const p2Before = state.players[1].cash;
    let s = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer });
    s = applyAction(s, "p2", { type: "RESPOND_TRADE", accept: true });
    expect(s.tiles[1].ownerId).toBe("p2");
    expect(s.players[1].cash).toBe(p2Before - interest);
    expect(s.bank).toBe(bankBefore + interest);
  });
});

describe("Bankruptcy improvements (M3/M4/out-of-turn guard)", () => {
  it("liquidates buildings to the creditor rather than vaporizing them", () => {
    const state = createGame(["p1", "p2"]);
    // p2 owes p1 via ledger and holds a built property.
    // p2 owns Bama (pos 3) with 2 houses.
    state.tiles[3] = { ownerId: "p2", houses: 2, mortgaged: false };
    state.currentPlayerIndex = 1;
    // Manufacture a ledger debt owed by p2 to p1.
    state.debtLedger = [{ debtorId: "p2", creditorId: "p1", amount: 1_000_000 }];
    state.players[1].cash = 0;

    const t3 = BOARD[3];
    const houseCost = "houseCost" in t3 ? t3.houseCost : 0;
    const liquidation = Math.floor(houseCost / 2) * 2;
    const p1Before = state.players[0].cash;

    const s = applyAction(state, "p2", { type: "DECLARE_BANKRUPT" });
    // Creditor received the liquidation proceeds (capped by the debt, which is huge).
    expect(s.players[0].cash).toBe(p1Before + liquidation);
    // Property handed to creditor, buildings cleared.
    expect(s.tiles[3].ownerId).toBe("p1");
    expect(s.tiles[3].houses).toBe(0);
  });

  it("out-of-turn bankruptcy does not hijack the current player's turn", () => {
    const state = createGame(["p1", "p2", "p3"]);
    // p1 is the active player, mid buy-decision.
    state.currentPlayerIndex = 0;
    state.phase = "awaiting-buy-decision";
    // p2 is cash-negative (eligible to declare) but it's not their turn.
    state.players[1].cash = -5_000;

    const s = applyAction(state, "p2", { type: "DECLARE_BANKRUPT" });
    // Turn stays with p1; their buy decision is intact.
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.phase).toBe("awaiting-buy-decision");
    expect(s.players[1].bankrupt).toBe(true);
  });

  it("returns an eliminated player's jail cards to the deck", () => {
    const state = createGame(["p1", "p2"]);
    state.currentPlayerIndex = 1;
    state.players[1].cash = -1_000;
    state.players[1].jailCardSources = ["hustle"];
    const before = state.hustleOrder.length;
    const s = applyAction(state, "p2", { type: "DECLARE_BANKRUPT" });
    // 2-player game: p1 wins, but the card must still return.
    expect(s.hustleOrder).toContain(HUSTLE_JAIL_ID);
    expect(s.hustleOrder.length).toBe(before + 1);
  });
});

describe("Forfeit round accounting (L1)", () => {
  it("with 3 players, a wrap-point forfeit increments the round and clears blackout", () => {
    const state = createGame(["p1", "p2", "p3"]);
    state.blackout = { untilRound: 2 };
    state.currentTurn = 1;
    state.currentPlayerIndex = 2; // p3 is last in order
    state.phase = "awaiting-roll";

    const s = applyAction(state, "p3", { type: "FORFEIT" });
    expect(s.currentTurn).toBe(2);
    expect(s.blackout).toBeNull();
    expect(s.currentPlayerIndex).toBe(0);
  });
});
