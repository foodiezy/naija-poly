// =============================================================================
// engine/types.ts — state + action shapes for the game engine.
// The reducer (engine.ts) is the NEXT build step; these types define its
// contract. Keep the engine PURE: applyAction(state, playerId, action) -> state.
// =============================================================================

import type { ColorGroup } from "../data/board";

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  cash: number;
  position: number; // 0–39
  inJail: boolean;
  jailTurns: number; // failed roll-out attempts
  getOutOfJailCards: number;
  bankrupt: boolean;
  order: number; // turn order
}

// Runtime ownership/development state for a single ownable tile, keyed by pos.
export interface TileState {
  ownerId: PlayerId | null;
  houses: number; // 0–4; 5 represents a hotel
  mortgaged: boolean;
}

export type Phase =
  | "awaiting-roll"
  | "awaiting-buy-decision" // landed on unowned property
  | "auction"
  | "resolving" // rent/tax/card being applied
  | "awaiting-end-turn"
  | "game-over";

export interface AuctionState {
  tilePos: number;
  highestBid: number;
  highestBidderId: PlayerId | null;
  activePlayerIds: PlayerId[];
  currentPlayerIndex: number;
}

export interface GameSettings {
  startingCash: number;
  turnLimit: number; // 0 = unlimited
  freeParkingJackpot: boolean;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  tiles: Record<number, TileState>; // pos -> state (only ownables)
  phase: Phase;
  dice: [number, number] | null;
  doublesCount: number; // consecutive doubles this turn
  chanceOrder: string[]; // shuffled card ids
  esusuOrder: string[];
  chancePtr: number;
  esusuPtr: number;
  log: string[]; // human-readable event log (great for the UI feed)
  winnerId: PlayerId | null;
  auctionState?: AuctionState | null;
  activeTrade?: TradeOffer | null;
  owedToId?: PlayerId | "bank" | null;
  settings: GameSettings;
  currentTurn: number; // current round number
  freeParkingPot: number; // Bukka Rest Stop jackpot pot
}

// ---- Actions the reducer will accept -------------------------------------
export type Action =
  | { type: "ROLL" }
  | { type: "BUY" }
  | { type: "DECLINE_BUY" } // triggers auction
  | { type: "BID"; amount: number }
  | { type: "PASS_BID" }
  | { type: "BUILD"; pos: number }
  | { type: "SELL_HOUSE"; pos: number }
  | { type: "MORTGAGE"; pos: number }
  | { type: "UNMORTGAGE"; pos: number }
  | { type: "PROPOSE_TRADE"; trade: TradeOffer }
  | { type: "RESPOND_TRADE"; accept: boolean }
  | { type: "PAY_JAIL_FINE" }
  | { type: "USE_JAIL_CARD" }
  | { type: "DECLARE_BANKRUPT" }
  | { type: "END_TURN" };

export interface TradeOffer {
  fromId: PlayerId;
  toId: PlayerId;
  giveCash: number;
  getCash: number;
  giveTiles: number[]; // positions
  getTiles: number[];
}

// Helper type re-exported for convenience in the reducer.
export type { ColorGroup };
