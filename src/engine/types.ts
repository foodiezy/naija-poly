// =============================================================================
// engine/types.ts — state + action shapes for the game engine.
// The reducer (engine.ts) is the NEXT build step; these types define its
// contract. Keep the engine PURE: applyAction(state, playerId, action) -> state.
// =============================================================================

import type { ColorGroup } from "../data/board";

export type PlayerId = string;

export type Objective =
  "own_2_airports" | "complete_color_set" | "cash_2m" | "own_4_properties" | "first_hotel";

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
  | "game-over"
  // --- Chaos Mode interactive decisions (each pauses play for one choice) ---
  | "awaiting-blackout-target" // C1: drawer picks which zone goes dark
  | "awaiting-stockpile-choice" // C3: drawer picks take-now vs double-next-round
  | "awaiting-firesale-pick" // C4: drawer picks a discounted tile (or declines)
  | "awaiting-efcc-choice"; // C5: the richest player picks pay-cash vs surrender

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

// ---- Chaos Mode pending-decision payloads --------------------------------
// Each mirrors AuctionState: a nullable field on GameState, populated only
// while its choice is live and cleared the moment the reducer resolves it.
// The `deadline` (server-stamped countdown) stays null in the pure engine.

export interface PendingBlackout {
  drawerId: PlayerId; // who chooses the zone
  selectableZones: ColorGroup[]; // zones that have an owned, un-mortgaged property
  deadline: number | null;
}

export interface PendingStockpile {
  playerId: PlayerId; // the drawer, deciding now vs double
  amount: number; // building income collectible immediately
  deadline: number | null;
}

export interface PendingFireSale {
  drawerId: PlayerId; // who may buy
  discountPct: number; // percent off list price (0–100)
  eligibleTiles: number[]; // positions of currently-unowned ownable tiles
  deadline: number | null;
}

export interface PendingEfcc {
  targetId: PlayerId; // the richest player (may not be the current player)
  cashAmount: number; // the cash settlement if they pay
  surrenderableTiles: number[]; // positions of tiles the target may forfeit
  deadline: number | null;
}

// A doubled payout the player earned by stockpiling (C3), paid out when the
// round counter reaches `dueRound` (same wrap semantics as a blackout window).
export interface DeferredPayout {
  playerId: PlayerId;
  amount: number;
  dueRound: number;
}

export interface GameSettings {
  startingCash: number;
  turnLimit: number; // 0 = unlimited
  freeParkingJackpot: boolean;
  chaosMode: boolean; // adds Naija "chaos" cards (e.g. NEPA blackout) to the deck
  secretObjectives?: boolean;
}

// A single outstanding debt entry in the ledger. Only created when the debtor
export interface DebtRecord {
  debtorId: PlayerId;
  creditorId: PlayerId | "bank" | "pot";
  amount: number; // always > 0; the original obligation
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
  debtLedger: DebtRecord[];
  settings: GameSettings;
  currentTurn: number; // current round number
  freeParkingPot: number; // Mama Put Rest Stop jackpot pot
  bank: number; // Bank's cash balance, tracks money minted/destroyed
  // Chaos-mode "NEPA blackout": while set, rent is waived. Ends once the round
  // counter reaches `untilRound` (i.e. play wraps back around once).
  //   - `zone` scopes the blackout to one property color group (C1 aimable
  //     blackout). Absent/undefined = a legacy global blackout (all zones dark).
  //   - `generatorOwners` are owners who paid to keep collecting in the zone (C2).
  blackout?: {
    untilRound: number;
    zone?: ColorGroup;
    generatorOwners?: PlayerId[];
  } | null;
  // Chaos-mode "Airport Strike": while set, no rent is collected on airports.
  airportStrike?: { untilRound: number } | null;
  // --- Chaos Mode interactive decisions (see the Pending* interfaces) ---
  pendingBlackout?: PendingBlackout | null; // C1
  pendingStockpile?: PendingStockpile | null; // C3
  pendingFireSale?: PendingFireSale | null; // C4
  pendingEfcc?: PendingEfcc | null; // C5
  // C3 doubled payouts awaiting their round wrap.
  deferredPayouts?: DeferredPayout[];
  votekicks: Record<PlayerId, PlayerId[]>; // targetId -> array of voterIds
  stats: Record<
    PlayerId,
    {
      rentPaid: number;
      highestAuctionBid: number;
      propertiesBought: number;
      jailTimes: number;
    }
  >;
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
  // Declining may carry a counter-offer: it replaces the pending trade with
  // roles swapped, so the original proposer becomes the new recipient.
  | { type: "RESPOND_TRADE"; accept: boolean; counter?: TradeOffer }
  | { type: "CANCEL_TRADE" } // proposer withdraws their own pending offer
  | { type: "PAY_JAIL_FINE" }
  | { type: "USE_JAIL_CARD" }
  | { type: "DECLARE_BANKRUPT" }
  | { type: "FORFEIT" } // a player permanently left (disconnect): eliminate them
  | { type: "VOTE_KICK"; targetId: PlayerId }
  | { type: "END_TURN" }
  // --- Chaos Mode interactive intents (routed to the pure reducer) ---
  | { type: "CHOOSE_BLACKOUT_ZONE"; zone: ColorGroup } // C1
  | { type: "BUY_GENERATOR" } // C2: an owner keeps their zone rent alive
  | { type: "CHOOSE_STOCKPILE"; mode: "now" | "double" } // C3
  | { type: "CHOOSE_FIRESALE_TILE"; pos: number } // C4
  | { type: "DECLINE_FIRESALE" } // C4
  | { type: "EFCC_PAY_CASH" } // C5
  | { type: "EFCC_SURRENDER"; pos: number }; // C5

export interface TradeOffer {
  fromId: PlayerId;
  toId: PlayerId;
  giveCash: number;
  getCash: number;
  giveTiles: number[]; // positions
  getTiles: number[];
  // Get Out of Jail Free cards changing hands (counts; the card's source deck
  // travels with it). Optional so older payloads/tests keep working.
  giveJailCards?: number;
  getJailCards?: number;
}

// Helper type re-exported for convenience in the reducer.
export type { ColorGroup };
