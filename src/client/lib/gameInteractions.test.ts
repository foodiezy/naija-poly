import { describe, expect, it } from "vitest";
import { createGame } from "../../engine/engine";
import type { TradeOffer } from "../../engine/types";
import { counterOfferFrom, playerInteractionState } from "./gameInteractions";

describe("playerInteractionState", () => {
  it("surfaces an incoming trade only to its recipient", () => {
    const state = createGame(["p1", "p2"]);
    state.activeTrade = {
      fromId: "p1",
      toId: "p2",
      giveCash: 100_000,
      getCash: 0,
      giveTiles: [],
      getTiles: [],
    };

    expect(playerInteractionState(state, "p1").incomingTrade).toBeNull();
    expect(playerInteractionState(state, "p2").incomingTrade).toBe(state.activeTrade);
    expect(playerInteractionState(state, "p2").canProposeTrade).toBe(false);
  });

  it("opens debt rescue for negative cash or ledger debt", () => {
    const state = createGame(["p1", "p2"]);
    state.players[0].cash = -25_000;
    expect(playerInteractionState(state, "p1").inDebt).toBe(true);

    state.players[0].cash = 100_000;
    state.debtLedger = [
      { debtorId: "p1", creditorId: "p2", amount: 80_000 },
      { debtorId: "p1", creditorId: "bank", amount: 20_000 },
    ];
    const interaction = playerInteractionState(state, "p1");
    expect(interaction.ledgerDebt).toBe(100_000);
    expect(interaction.inDebt).toBe(true);
  });

  it("does not surface debt rescue for an eliminated player", () => {
    const state = createGame(["p1", "p2"]);
    state.players[0].cash = -25_000;
    state.players[0].bankrupt = true;
    expect(playerInteractionState(state, "p1").inDebt).toBe(false);
  });

  it("blocks new offers during auctions, game over, and pending trades", () => {
    const state = createGame(["p1", "p2"]);
    expect(playerInteractionState(state, "p1").canProposeTrade).toBe(true);

    state.phase = "auction";
    expect(playerInteractionState(state, "p1").canProposeTrade).toBe(false);
    state.phase = "game-over";
    expect(playerInteractionState(state, "p1").canProposeTrade).toBe(false);
  });
});

describe("counterOfferFrom", () => {
  it("reverses every asset class without mutating the incoming offer", () => {
    const incoming: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 100_000,
      getCash: 250_000,
      giveTiles: [1, 3],
      getTiles: [6],
      giveJailCards: 1,
      getJailCards: 2,
    };

    const counter = counterOfferFrom(incoming, "p2");
    expect(counter).toEqual({
      fromId: "p2",
      toId: "p1",
      giveCash: 250_000,
      getCash: 100_000,
      giveTiles: [6],
      getTiles: [1, 3],
      giveJailCards: 2,
      getJailCards: 1,
    });
    expect(counter.giveTiles).not.toBe(incoming.getTiles);
    expect(counter.getTiles).not.toBe(incoming.giveTiles);
  });

  it("rejects a counter from somebody other than the recipient", () => {
    const incoming: TradeOffer = {
      fromId: "p1",
      toId: "p2",
      giveCash: 0,
      getCash: 0,
      giveTiles: [],
      getTiles: [],
    };
    expect(() => counterOfferFrom(incoming, "p3")).toThrow("recipient");
  });
});
