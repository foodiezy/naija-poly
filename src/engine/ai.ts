// =============================================================================
// engine/ai.ts — a simple, pure decision function for computer players.
// getAIAction(state, playerId) returns the next Action that AI player should
// take, or null if there's nothing for them to do right now. No I/O, no
// randomness — the server drives pacing and applies the action via the engine.
// =============================================================================

import { BOARD, PropertyTile, JAIL_FINE } from "../data/board";
import type { GameState, PlayerId, Action } from "./types";
// Default cash buffer to keep on hand rather than spending to zero.
const DEFAULT_CASH_BUFFER = 50_000;

function isProperty(pos: number): boolean {
  return BOARD[pos].type === "property";
}

// Rough cash value of a board position for trade valuation (list price).
function tilePrice(pos: number): number {
  const t = BOARD[pos];
  return "price" in t ? t.price : 0;
}

// Properties in the same colour group as the given property tile.
function groupTiles(tile: PropertyTile): PropertyTile[] {
  return BOARD.filter(
    (t): t is PropertyTile => t.type === "property" && t.group === tile.group,
  );
}

// Can `playerId` legally build a house on `pos` right now? Mirrors the engine's
// build rules (full group, none mortgaged, even-build, can afford, < hotel).
function canBuild(state: GameState, playerId: PlayerId, pos: number): boolean {
  const tile = BOARD[pos];
  if (tile.type !== "property") return false;
  const ts = state.tiles[pos];
  if (!ts || ts.ownerId !== playerId || ts.mortgaged || ts.houses >= 5) return false;

  const group = groupTiles(tile);
  if (!group.every((t) => state.tiles[t.pos]?.ownerId === playerId)) return false;
  if (group.some((t) => state.tiles[t.pos]?.mortgaged)) return false;
  // Even build: can't exceed the least-developed property in the group.
  if (group.some((t) => (state.tiles[t.pos]?.houses ?? 0) < ts.houses)) return false;

  const me = state.players.find((p) => p.id === playerId);
  return !!me && me.cash >= tile.houseCost + CASH_BUFFER;
}

// A mortgageable property the player owns (unmortgaged, no buildings in group).
function findMortgageable(state: GameState, playerId: PlayerId): number | null {
  for (const tile of BOARD) {
    const ts = state.tiles[tile.pos];
    if (!ts || ts.ownerId !== playerId || ts.mortgaged) continue;
    if (tile.type === "property") {
      const hasBuildings = groupTiles(tile).some((t) => (state.tiles[t.pos]?.houses ?? 0) > 0);
      if (hasBuildings) continue;
    }
    return tile.pos;
  }
  return null;
}

// A property with a sellable house (used to raise cash when in debt).
function findSellableHouse(state: GameState, playerId: PlayerId): number | null {
  for (const tile of BOARD) {
    const ts = state.tiles[tile.pos];
    if (!ts || ts.ownerId !== playerId || tile.type !== "property" || ts.houses === 0) continue;
    // Even-sell: only sell from the most-developed property in the group.
    const group = groupTiles(tile);
    if (group.some((t) => (state.tiles[t.pos]?.houses ?? 0) > ts.houses)) continue;
    return tile.pos;
  }
  return null;
}

/**
 * Decide the AI player's next move. Returns null when it's not their turn and
 * they have no auction action pending.
 */
export function getAIAction(state: GameState, playerId: PlayerId): Action | null {
  const me = state.players.find((p) => p.id === playerId);
  if (!me || me.bankrupt) return null;

  const style = me.aiStyle || "Normal";

  // Customize thresholds based on personality
  let cashBuffer = DEFAULT_CASH_BUFFER;
  if (style === "CashSaver") cashBuffer = 150_000;
  if (style === "PropertyHoarder") cashBuffer = 0;

  // --- Trades: respond to an offer addressed to us.
  if (state.activeTrade && state.activeTrade.toId === playerId) {
    const t = state.activeTrade;
    const receive = t.giveCash + t.giveTiles.reduce((s, p) => s + tilePrice(p), 0);
    const giveUp = t.getCash + t.getTiles.reduce((s, p) => s + tilePrice(p), 0);
    let accept = t.getCash <= me.cash && receive >= giveUp;
    
    // Trader accepts slight losses to keep things moving
    if (style === "Trader" && t.getCash <= me.cash && receive >= giveUp * 0.9) {
      accept = true;
    }
    
    return { type: "RESPOND_TRADE", accept };
  }

  // --- Auctions: any solvent participant may act, not just the active player.
  if (state.phase === "auction" && state.auctionState) {
    const a = state.auctionState;
    if (!a.participantIds.includes(playerId) || a.passedIds.includes(playerId)) return null;
    if (a.highestBidderId === playerId) return null; // already winning

    const tile = BOARD[a.tilePos];
    const value = "price" in tile ? tile.price : 0;
    
    let capMultiplier = 0.8;
    if (style === "AggressiveBidder") capMultiplier = 1.2;
    if (style === "PropertyHoarder") capMultiplier = 1.0;
    if (style === "CashSaver") capMultiplier = 0.6;
    
    const cap = Math.floor(value * capMultiplier);
    const inc = a.bidIncrements[0];
    const nextBid = a.highestBid + inc;
    if (nextBid <= cap && me.cash >= nextBid + cashBuffer) {
      return { type: "BID", amount: nextBid };
    }
    return { type: "PASS_BID" };
  }

  // Everything below is only for the AI's own turn.
  if (state.players[state.currentPlayerIndex]?.id !== playerId) return null;

  switch (state.phase) {
    case "awaiting-roll": {
      if (me.inJail) {
        if (me.jailCardSources.length > 0) return { type: "USE_JAIL_CARD" };
        if (me.cash >= 200_000 + cashBuffer) return { type: "PAY_JAIL_FINE" };
        // Can't comfortably pay — roll for doubles (or pay if forced later).
        if (me.jailTurns >= 2 && me.cash >= JAIL_FINE) return { type: "PAY_JAIL_FINE" };
      }
      return { type: "ROLL" };
    }

    case "awaiting-buy-decision": {
      const tile = BOARD[me.position];
      const price = "price" in tile ? tile.price : 0;
      // Buy when it clearly fits the budget, or when it completes/extends a set.
      const completesGroup =
        tile.type === "property" &&
        groupTiles(tile as PropertyTile).some(
          (t) => t.pos !== me.position && state.tiles[t.pos]?.ownerId === playerId,
        );
      const threshold = completesGroup ? price + cashBuffer : price * (style === "PropertyHoarder" ? 1 : 2);
      if (me.cash >= threshold) return { type: "BUY" };
      return { type: "DECLINE_BUY" };
    }

    case "awaiting-end-turn": {
      // Resolve debt first if somehow negative.
      if (me.cash < 0) {
        const sell = findSellableHouse(state, playerId);
        if (sell !== null) return { type: "SELL_HOUSE", pos: sell };
        const mort = findMortgageable(state, playerId);
        if (mort !== null) return { type: "MORTGAGE", pos: mort };
        return { type: "DECLARE_BANKRUPT" };
      }
      // Develop a property if we can afford it.
      let buildBuffer = cashBuffer;
      if (style === "Builder") buildBuffer = 0; // Builder spends all cash on houses

      for (const tile of BOARD) {
        if (isProperty(tile.pos)) {
          // Re-implement canBuild check with custom buildBuffer
          const ts = state.tiles[tile.pos];
          if (ts && ts.ownerId === playerId && !ts.mortgaged && ts.houses < 5) {
            const group = groupTiles(tile as PropertyTile);
            if (group.every((t) => state.tiles[t.pos]?.ownerId === playerId)) {
              if (!group.some((t) => state.tiles[t.pos]?.mortgaged)) {
                if (!group.some((t) => (state.tiles[t.pos]?.houses ?? 0) < ts.houses)) {
                  if (me.cash >= (tile as PropertyTile).houseCost + buildBuffer) {
                    return { type: "BUILD", pos: tile.pos };
                  }
                }
              }
            }
          }
        }
      }
      
      // Trader might randomly propose a trade if they have some cash but need properties
      if (style === "Trader" && Math.random() < 0.3) {
        // Find a property we need to complete a set
        for (const tile of BOARD) {
          if (isProperty(tile.pos) && state.tiles[tile.pos]?.ownerId && state.tiles[tile.pos]?.ownerId !== playerId) {
            const group = groupTiles(tile as PropertyTile);
            const ownedInGroup = group.filter((t) => state.tiles[t.pos]?.ownerId === playerId).length;
            if (ownedInGroup > 0) {
              const targetOwner = state.tiles[tile.pos]!.ownerId!;
              // propose trade for this tile
              return {
                type: "PROPOSE_TRADE",
                trade: {
                  fromId: playerId,
                  toId: targetOwner,
                  giveCash: Math.min(me.cash, tilePrice(tile.pos) + 20000),
                  getCash: 0,
                  giveTiles: [],
                  getTiles: [tile.pos]
                }
              };
            }
          }
        }
      }

      return { type: "END_TURN" };
    }

    default:
      return null;
  }
}
