// =============================================================================
// engine/types.ts — state + action shapes for the game engine.
// The reducer (engine.ts) is the NEXT build step; these types define its
// contract. Keep the engine PURE: applyAction(state, playerId, action) -> state.
// =============================================================================

import type { ColorGroup } from "../data/board";

export type PlayerId = string;

export type Objective = "own_2_airports" | "complete_color_set" | "cash_2m" | "own_4_properties" | "first_hotel";

export interface Player {
  id: PlayerId;
  name: string;
  cash: number;
  position: number; // 0–39
  inJail: boolean;
  jailTurns: number; // failed roll-out attempts
  jailCardSources: Array<"chance" | "hustle">; // which deck each held card came from
  bankrupt: boolean;
  kicked?: boolean; // True if eliminated by vote-kick
  order: number; // turn order
  aiStyle?: "AggressiveBidder" | "PropertyHoarder" | "Builder" | "CashSaver" | "Trader" | "Normal";
  secretObjective?: Objective;
  objectiveCompleted?: boolean;
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
  highestBid: number; // current top bid (0 until the first bid lands)
  highestBidderId: PlayerId | null;
  participantIds: PlayerId[]; // everyone eligible to bid (all solvent players)
  passedIds: PlayerId[]; // players who have folded out of this auction
  // Open-outcry, fixed-increment bidding: a legal bid raises the top bid by
  // exactly one of these set values. Keeps auctions fast and unambiguous.
  minIncrement: number;
  bidIncrements: number[];
  // Server-driven countdown. The pure engine never reads `deadline` (it stays
  // null in tests); the authoritative server stamps it (and re-stamps on every
  // bid) so clients can render the timer and the room can auto-resolve on expiry.
  bidDurationMs: number;
  deadline: number | null;
}

export interface GameSettings {
  startingCash: number;
  turnLimit: number; // 0 = unlimited
  freeParkingJackpot: boolean;
  chaosMode: boolean; // adds Naija "chaos" cards (e.g. NEPA blackout) to the deck
  secretObjectives?: boolean;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  tiles: Record<number, TileState>; // pos -> state (only ownables)
  phase: Phase;
  dice: [number, number] | null;
  doublesCount: number; // consecutive doubles this turn
  chanceOrder: string[]; // shuffled card ids
  hustleOrder: string[];
  chancePtr: number;
  hustlePtr: number;
  log: string[]; // human-readable event log (great for the UI feed)
  winnerId: PlayerId | null;
  auctionState?: AuctionState | null;
  activeTrade?: TradeOffer | null;
  owedToId?: PlayerId | "bank" | null;
  settings: GameSettings;
  currentTurn: number; // current round number
  freeParkingPot: number; // Mama Put Rest Stop jackpot pot
  // Chaos-mode "NEPA blackout": while set, no rent is collected. Ends once the
  // round counter reaches `untilRound` (i.e. play wraps back around once).
  blackout?: { untilRound: number } | null;
  // Chaos-mode "Airport Strike": while set, no rent is collected on airports.
  airportStrike?: { untilRound: number } | null;
  votekicks: Record<PlayerId, PlayerId[]>; // targetId -> array of voterIds
  stats: Record<PlayerId, {
    rentPaid: number;
    highestAuctionBid: number;
    propertiesBought: number;
    jailTimes: number;
  }>;
}

// ---- Actions the reducer will accept -------------------------------------
export type Action =
  | { type: "ROLL" }
  | { type: "BUY" }
  | { type: "DECLINE_BUY" } // triggers auction
  | { type: "BID"; amount: number }
  | { type: "PASS_BID" }
  | { type: "RESOLVE_AUCTION" } // server-only: fired when the bid timer expires
  | { type: "BUILD"; pos: number }
  | { type: "SELL_HOUSE"; pos: number }
  | { type: "MORTGAGE"; pos: number }
  | { type: "UNMORTGAGE"; pos: number }
  | { type: "PROPOSE_TRADE"; trade: TradeOffer }
  | { type: "RESPOND_TRADE"; accept: boolean }
  | { type: "PAY_JAIL_FINE" }
  | { type: "USE_JAIL_CARD" }
  | { type: "DECLARE_BANKRUPT" }
  | { type: "FORFEIT" } // a player permanently left (disconnect): eliminate them
  | { type: "VOTE_KICK"; targetId: PlayerId }
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
