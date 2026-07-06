import { describe, it, expect } from "vitest";
import { createGame } from "./engine";
import { getAIAction } from "./ai";

// Helper: a fresh 2-player game with the AI ("ai_1") as the current player.
function setup() {
  const state = createGame(["ai_1", "p2"]);
  state.currentPlayerIndex = 0;
  // createGame assigns a random aiStyle to ai_ ids; every assertion in this
  // file assumes the "Normal" style's thresholds, so pin it.
  state.players[0].aiStyle = "Normal";
  return state;
}

describe("getAIAction", () => {
  it("rolls when it's the AI's turn and awaiting roll", () => {
    const s = setup();
    s.phase = "awaiting-roll";
    expect(getAIAction(s, "ai_1")).toEqual({ type: "ROLL" });
  });

  it("returns null when it is not the AI's turn", () => {
    const s = setup();
    s.phase = "awaiting-roll";
    s.currentPlayerIndex = 1; // p2's turn
    expect(getAIAction(s, "ai_1")).toBeNull();
  });

  it("buys an affordable property and declines an unaffordable one", () => {
    const s = setup();
    s.phase = "awaiting-buy-decision";
    s.players[0].position = 1; // Ajegunle (price 60,000)

    s.players[0].cash = 1_000_000;
    expect(getAIAction(s, "ai_1")).toEqual({ type: "BUY" });

    s.players[0].cash = 50_000; // below the 2x-price threshold
    expect(getAIAction(s, "ai_1")).toEqual({ type: "DECLINE_BUY" });
  });

  it("pays the jail fine when flush, otherwise rolls", () => {
    const s = setup();
    s.phase = "awaiting-roll";
    s.players[0].inJail = true;
    s.players[0].cash = 1_000_000;
    expect(getAIAction(s, "ai_1")).toEqual({ type: "PAY_JAIL_FINE" });

    s.players[0].cash = 10_000; // too poor to pay comfortably
    expect(getAIAction(s, "ai_1")).toEqual({ type: "ROLL" });
  });

  it("bids under the value cap and passes once it gets too expensive", () => {
    const s = setup();
    s.phase = "auction";
    s.players[0].cash = 1_000_000;
    s.auctionState = {
      tilePos: 1, // Ajegunle, price 60,000 -> cap 48,000
      highestBid: 0,
      highestBidderId: null,
      participantIds: ["ai_1", "p2"],
      passedIds: [],
      minIncrement: 10_000,
      bidIncrements: [10_000, 20_000],
      bidDurationMs: 12_000,
      deadline: null,
    };
    expect(getAIAction(s, "ai_1")).toEqual({ type: "BID", amount: 10_000 });

    s.auctionState.highestBid = 45_000; // next bid 55,000 > cap 48,000
    expect(getAIAction(s, "ai_1")).toEqual({ type: "PASS_BID" });
  });

  it("ends the turn when there's nothing to develop", () => {
    const s = setup();
    s.phase = "awaiting-end-turn";
    s.players[0].cash = 1_000_000;
    expect(getAIAction(s, "ai_1")).toEqual({ type: "END_TURN" });
  });

  it("declares bankruptcy in debt with no assets to liquidate", () => {
    const s = setup();
    s.phase = "awaiting-end-turn";
    s.players[0].cash = -50_000;
    expect(getAIAction(s, "ai_1")).toEqual({ type: "DECLARE_BANKRUPT" });
  });

  it("responds to a trade addressed to it, even on another player's turn", () => {
    const s = setup();
    s.phase = "awaiting-end-turn";
    s.currentPlayerIndex = 1; // p2 (the proposer) is the active player
    s.players[0].cash = 1_000_000;

    // p2 offers ₦100,000 cash for nothing — clearly favorable, accept.
    s.activeTrade = { fromId: "p2", toId: "ai_1", giveCash: 100_000, getCash: 0, giveTiles: [], getTiles: [] };
    expect(getAIAction(s, "ai_1")).toEqual({ type: "RESPOND_TRADE", accept: true });

    // p2 asks the AI for ₦100,000 and gives nothing — lopsided, decline.
    s.activeTrade = { fromId: "p2", toId: "ai_1", giveCash: 0, getCash: 100_000, giveTiles: [], getTiles: [] };
    expect(getAIAction(s, "ai_1")).toEqual({ type: "RESPOND_TRADE", accept: false });

    // Asking more cash than the AI holds is declined regardless of value.
    s.players[0].cash = 10_000;
    s.activeTrade = { fromId: "p2", toId: "ai_1", giveCash: 0, getCash: 50_000, giveTiles: [1], getTiles: [] };
    expect(getAIAction(s, "ai_1")).toEqual({ type: "RESPOND_TRADE", accept: false });
  });
});
