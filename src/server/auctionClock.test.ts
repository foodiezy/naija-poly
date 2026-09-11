import { describe, expect, it } from "vitest";
import { createGame, applyAction } from "../engine/engine";
import { auctionClock } from "./auctionClock";

function startAuction() {
  const state = createGame(["p1", "p2", "p3"]);
  state.players[0].position = 1;
  state.phase = "awaiting-buy-decision";
  return applyAction(state, "p1", { type: "DECLINE_BUY" });
}

describe("Auction server clock", () => {
  it("starts at eight seconds and does not extend the deadline when someone passes", () => {
    const state = startAuction();
    state.auctionState!.deadline = auctionClock(state.auctionState!, 1000).deadline;
    const next = applyAction(state, "p3", { type: "PASS_BID" });
    expect(auctionClock(next.auctionState!, 4000)).toEqual({ deadline: 9000, delay: 5000 });
  });

  it("gives an accepted bid the reduced window even when placed near the deadline", () => {
    const state = startAuction();
    state.auctionState!.deadline = 9000;
    const next = applyAction(state, "p2", {
      type: "BID",
      amount: state.auctionState!.bidIncrements[0],
    });
    expect(auctionClock(next.auctionState!, 8900)).toEqual({ deadline: 15900, delay: 7000 });
  });

  it("resolves overdue auctions immediately instead of reopening them", () => {
    const state = startAuction();
    state.auctionState!.deadline = 9000;
    expect(auctionClock(state.auctionState!, 10000)).toEqual({ deadline: 9000, delay: 0 });
  });
});
