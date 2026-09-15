import type { AuctionState } from "../engine/types";

/** Only a new auction or accepted bid (null deadline) starts a fresh window. */
export function auctionClock(auction: AuctionState, now: number) {
  const deadline = auction.deadline ?? now + auction.bidDurationMs;
  return { deadline, delay: Math.max(0, deadline - now) };
}
