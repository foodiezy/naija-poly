import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "./engine";

describe("Beta playtest feedback", () => {
  it("shortens every accepted bid down to a three-second floor without mutating the input", () => {
    const initial = createGame(["p1", "p2", "p3"]);
    initial.players[0].position = 1;
    initial.phase = "awaiting-buy-decision";
    let state = applyAction(initial, "p1", { type: "DECLINE_BUY" });
    expect(state.auctionState?.bidDurationMs).toBe(8000);
    for (let i = 0; i < 8; i++) {
      const before = state;
      const auction = before.auctionState!;
      const previousDuration = auction.bidDurationMs;
      state = applyAction(before, i % 2 ? "p2" : "p1", {
        type: "BID",
        amount: auction.highestBid + auction.bidIncrements[0],
      });
      expect(state.auctionState?.bidDurationMs).toBe(Math.max(3000, 7000 - i * 1000));
      expect(state.auctionState?.deadline).toBeNull();
      expect(before.auctionState?.bidDurationMs).toBe(previousDuration);
    }
  });

  it("expires votes against the player ending their turn, preserving votes against others", () => {
    const initial = createGame(["p1", "p2", "p3", "p4"]);
    let state = applyAction(initial, "p2", { type: "VOTE_KICK", targetId: "p1" });
    state = applyAction(state, "p3", { type: "VOTE_KICK", targetId: "p4" });
    state.phase = "awaiting-end-turn";
    const next = applyAction(state, "p1", { type: "END_TURN" });
    expect(next.votekicks.p1).toBeUndefined();
    expect(next.votekicks.p4).toEqual(["p3"]);
    expect(state.votekicks.p1).toEqual(["p2"]);
    expect(applyAction(next, "p2", { type: "VOTE_KICK", targetId: "p1" }).votekicks.p1).toEqual([
      "p2",
    ]);
  });

  it("keeps votes during an extra roll because the player's turn has not ended", () => {
    let state = createGame(["p1", "p2", "p3"]);
    state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p1" });
    state.phase = "awaiting-end-turn";
    state.doublesCount = 1;
    expect(applyAction(state, "p1", { type: "END_TURN" }).votekicks.p1).toEqual(["p2"]);
  });

  it("names the mortgage owner and charges no rent", () => {
    const state = createGame(["p1", "F3saZE19V"]);
    state.players[0].name = "Fuad";
    state.players[1].name = "Ada";
    state.players[0].position = 36;
    state.tiles[39] = { ownerId: "F3saZE19V", houses: 0, mortgaged: true };
    let roll = 0;
    const next = applyAction(state, "p1", { type: "ROLL" }, () => [0, 0.2][roll++ % 2]);
    expect(next.log).toContain(
      "Fuad landed on Ikoyi (owned by Ada), but it is mortgaged. No rent is due.",
    );
    expect(next.players[0].cash).toBe(state.players[0].cash);
    expect(next.log.join(" ")).not.toContain("F3saZE19V");
  });
});
