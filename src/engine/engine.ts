// =============================================================================
// engine/engine.ts — the pure game engine.
//
// Implement these as pure functions: given state + action, return NEW state.
// Never mutate inputs. The server and the tests both call applyAction.
// =============================================================================

import {
  BOARD,
  CHANCE_CARDS,
  ESUSU_CARDS,
  STARTING_CASH,
  GO_SALARY,
  JAIL_POSITION,
  JAIL_FINE,
  HOUSE_SUPPLY,
  HOTEL_SUPPLY,
  type PropertyTile,
} from "../data/board";
import type { Action, GameState, PlayerId, TileState, Player } from "./types";

// Helper: Shuffles an array using Fisher-Yates and the injected rng
function shuffle<T>(array: T[], rng: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Calculates rent for a given board position in a specific GameState.
 */
export function getRent(state: GameState, pos: number, diceTotal: number): number {
  const tile = BOARD[pos];
  if (!tile) return 0;

  const tileState = state.tiles[pos];
  if (!tileState || tileState.ownerId === null || tileState.mortgaged) {
    return 0;
  }

  const ownerId = tileState.ownerId;

  if (tile.type === "property") {
    const houses = tileState.houses;
    if (houses > 0) {
      return tile.rent[houses];
    }

    // Unimproved color group check: rent[0] is doubled if the owner holds the full group unimproved
    const group = tile.group;
    const groupTiles = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === group);
    const ownsAll = groupTiles.every((t) => state.tiles[t.pos]?.ownerId === ownerId);
    const allUnimproved = groupTiles.every((t) => (state.tiles[t.pos]?.houses ?? 0) === 0);

    const baseRent = tile.rent[0];
    return (ownsAll && allUnimproved) ? baseRent * 2 : baseRent;
  }

  if (tile.type === "airport") {
    const ownedCount = BOARD.filter((t) => t.type === "airport" && state.tiles[t.pos]?.ownerId === ownerId).length;
    return tile.rent[ownedCount - 1] ?? 0;
  }

  if (tile.type === "utility") {
    const ownedCount = BOARD.filter((t) => t.type === "utility" && state.tiles[t.pos]?.ownerId === ownerId).length;
    const multiplier = tile.multiplier[ownedCount - 1] ?? 0;
    return diceTotal * multiplier;
  }

  return 0;
}

export function createGame(
  playerIds: PlayerId[],
  rng: () => number = Math.random,
): GameState {
  if (playerIds.length < 2) {
    throw new Error("A game must have at least 2 players");
  }

  const players: Player[] = playerIds.map((id, index) => ({
    id,
    name: id,
    cash: STARTING_CASH,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    bankrupt: false,
    order: index,
  }));

  const tiles: Record<number, TileState> = {};
  BOARD.forEach((tile) => {
    if (tile.type === "property" || tile.type === "airport" || tile.type === "utility") {
      tiles[tile.pos] = {
        ownerId: null,
        houses: 0,
        mortgaged: false,
      };
    }
  });

  const chanceOrder = shuffle(CHANCE_CARDS.map((c) => c.id), rng);
  const esusuOrder = shuffle(ESUSU_CARDS.map((c) => c.id), rng);

  return {
    players,
    currentPlayerIndex: 0,
    tiles,
    phase: "awaiting-roll",
    dice: null,
    doublesCount: 0,
    chanceOrder,
    esusuOrder,
    chancePtr: 0,
    esusuPtr: 0,
    log: ["Game started."],
    winnerId: null,
  };
}

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  rng: () => number = Math.random,
): GameState {
  // Deep copy state to maintain purity
  const nextState: GameState = JSON.parse(JSON.stringify(state));

  const currentPlayer = nextState.players[nextState.currentPlayerIndex];
  if (!currentPlayer) {
    throw new Error("No current player found");
  }

  // Validate player turn (unless declaring bankruptcy when bankrupt, bidding in auction, or responding to trade)
  const isAuctionAction = action.type === "BID" || action.type === "PASS_BID";
  const isTradeResponse = action.type === "RESPOND_TRADE";

  if (playerId !== currentPlayer.id && !isAuctionAction && !isTradeResponse) {
    const playerObj = nextState.players.find(p => p.id === playerId);
    const isDeclaringBankruptInDebt = action.type === "DECLARE_BANKRUPT" && playerObj && playerObj.cash < 0;
    if (!isDeclaringBankruptInDebt) {
      throw new Error(`It is not player ${playerId}'s turn. Current player is ${currentPlayer.id}`);
    }
  }

  switch (action.type) {
    case "ROLL": {
      if (nextState.phase !== "awaiting-roll") {
        throw new Error(`Cannot roll in phase ${nextState.phase}`);
      }

      const d1 = Math.floor(rng() * 6) + 1;
      const d2 = Math.floor(rng() * 6) + 1;
      const diceTotal = d1 + d2;
      nextState.dice = [d1, d2];

      if (currentPlayer.inJail) {
        if (d1 === d2) {
          currentPlayer.inJail = false;
          currentPlayer.jailTurns = 0;
          nextState.doublesCount = 0; // escape jail doubles does not count towards 3x doubles jail limit
          nextState.log.push(`${currentPlayer.name} rolled doubles [${d1}, ${d2}] and escaped Jail!`);

          movePlayerAndResolve(nextState, currentPlayer, diceTotal, rng);
        } else {
          currentPlayer.jailTurns += 1;
          if (currentPlayer.jailTurns >= 3) {
            currentPlayer.cash -= JAIL_FINE;
            currentPlayer.inJail = false;
            currentPlayer.jailTurns = 0;
            nextState.log.push(
              `${currentPlayer.name} failed to roll doubles for the 3rd time in Jail. Paid ₦50,000 fine and moved.`
            );

            movePlayerAndResolve(nextState, currentPlayer, diceTotal, rng);
          } else {
            nextState.log.push(
              `${currentPlayer.name} rolled [${d1}, ${d2}] in Jail. Remain in Jail (attempt ${currentPlayer.jailTurns}/3).`
            );
            nextState.phase = "awaiting-end-turn";
          }
        }
      } else {
        // Normal roll
        if (d1 === d2) {
          nextState.doublesCount += 1;
          if (nextState.doublesCount === 3) {
            currentPlayer.inJail = true;
            currentPlayer.jailTurns = 0;
            currentPlayer.position = JAIL_POSITION;
            nextState.doublesCount = 0;
            nextState.log.push(`${currentPlayer.name} rolled doubles 3 times in a row and went to Kirikiri Prison!`);
            nextState.phase = "awaiting-end-turn";
            return nextState;
          }
        } else {
          nextState.doublesCount = 0;
        }

        nextState.log.push(`${currentPlayer.name} rolled [${d1}, ${d2}].`);
        movePlayerAndResolve(nextState, currentPlayer, diceTotal, rng);
      }
      break;
    }

    case "BUY": {
      if (nextState.phase !== "awaiting-buy-decision") {
        throw new Error(`Cannot buy in phase ${nextState.phase}`);
      }

      const pos = currentPlayer.position;
      const tile = BOARD[pos];
      if (!tile || !("price" in tile)) {
        throw new Error(`Tile at position ${pos} is not ownable`);
      }

      const tileState = nextState.tiles[pos];
      if (!tileState || tileState.ownerId !== null) {
        throw new Error("Tile is already owned");
      }

      if (currentPlayer.cash < tile.price) {
        throw new Error(`Insufficient cash (₦${currentPlayer.cash}) to buy ${tile.name} (₦${tile.price})`);
      }

      currentPlayer.cash -= tile.price;
      tileState.ownerId = currentPlayer.id;
      nextState.log.push(`${currentPlayer.name} bought ${tile.name} for ₦${tile.price.toLocaleString("en-NG")}.`);
      nextState.phase = "awaiting-end-turn";
      break;
    }

    case "DECLINE_BUY": {
      if (nextState.phase !== "awaiting-buy-decision") {
        throw new Error(`Cannot decline buy in phase ${nextState.phase}`);
      }

      const pos = currentPlayer.position;
      const tile = BOARD[pos];
      nextState.log.push(`${currentPlayer.name} declined to buy ${tile.name}. Starting auction!`);

      const activePlayers = nextState.players.filter((p) => !p.bankrupt);
      if (activePlayers.length === 0) {
        nextState.phase = "awaiting-end-turn";
        break;
      }

      nextState.auctionState = {
        tilePos: pos,
        highestBid: 0,
        highestBidderId: null,
        activePlayerIds: activePlayers.map((p) => p.id),
        currentPlayerIndex: 0,
      };
      nextState.phase = "auction";

      const currentBidderId = nextState.auctionState.activePlayerIds[0];
      const currentBidder = nextState.players.find((p) => p.id === currentBidderId)!;
      nextState.log.push(`Auction started for ${tile.name}. Current bidder: ${currentBidder.name}.`);
      break;
    }

    case "BUILD": {
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot build in phase ${nextState.phase}`);
      }
      const pos = action.pos;
      const tile = BOARD[pos];
      if (!tile || tile.type !== "property") {
        throw new Error(`Position ${pos} is not a buildable property`);
      }

      const tileState = nextState.tiles[pos];
      if (!tileState || tileState.ownerId !== currentPlayer.id) {
        throw new Error("You do not own this property");
      }
      if (tileState.mortgaged) {
        throw new Error("Cannot build on a mortgaged property");
      }

      // Ownership check: must own the entire color group
      const group = tile.group;
      const groupTiles = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === group);
      const ownsAll = groupTiles.every((t) => nextState.tiles[t.pos]?.ownerId === currentPlayer.id);
      if (!ownsAll) {
        throw new Error("You must own the full color group to build");
      }

      // Mortgage check: none of the properties in the group can be mortgaged
      const anyMortgaged = groupTiles.some((t) => nextState.tiles[t.pos]?.mortgaged);
      if (anyMortgaged) {
        throw new Error("Cannot build when any property in the group is mortgaged");
      }

      // Upgrade capacity: max is 5 (hotel)
      if (tileState.houses >= 5) {
        throw new Error("Property is already fully developed (hotel)");
      }

      // Even build constraint: cannot build a house on this property if it has more houses than another in the group
      const targetHouses = tileState.houses;
      const violatesEven = groupTiles.some((t) => (nextState.tiles[t.pos]?.houses ?? 0) < targetHouses);
      if (violatesEven) {
        throw new Error("You must build evenly across all properties in the color group");
      }

      // Bank supply check
      let currentTotalHouses = 0;
      let currentTotalHotels = 0;
      Object.values(nextState.tiles).forEach((ts) => {
        if (ts.houses === 5) {
          currentTotalHotels += 1;
        } else if (ts.houses >= 1 && ts.houses <= 4) {
          currentTotalHouses += ts.houses;
        }
      });

      const isUpgradingToHotel = tileState.houses === 4;
      if (isUpgradingToHotel) {
        // consumes 1 hotel, frees 4 houses
        if (currentTotalHotels >= HOTEL_SUPPLY) {
          throw new Error("No hotels remaining in the bank");
        }
      } else {
        // consumes 1 house
        if (currentTotalHouses >= HOUSE_SUPPLY) {
          throw new Error("No houses remaining in the bank");
        }
      }

      // Cash check
      if (currentPlayer.cash < tile.houseCost) {
        throw new Error(`Insufficient cash to build (requires ₦${tile.houseCost})`);
      }

      currentPlayer.cash -= tile.houseCost;
      tileState.houses += 1;

      const buildType = tileState.houses === 5 ? "Hotel" : `House ${tileState.houses}`;
      nextState.log.push(`${currentPlayer.name} built a ${buildType} on ${tile.name} for ₦${tile.houseCost.toLocaleString("en-NG")}.`);
      break;
    }

    case "SELL_HOUSE": {
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot sell houses in phase ${nextState.phase}`);
      }
      const pos = action.pos;
      const tile = BOARD[pos];
      if (!tile || tile.type !== "property") {
        throw new Error(`Position ${pos} is not a property`);
      }

      const tileState = nextState.tiles[pos];
      if (!tileState || tileState.ownerId !== currentPlayer.id) {
        throw new Error("You do not own this property");
      }
      if (tileState.houses === 0) {
        throw new Error("No buildings on this property to sell");
      }

      // Even selling constraint: cannot sell if target has fewer houses than another in the group (must be max)
      const targetHouses = tileState.houses;
      const group = tile.group;
      const groupTiles = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === group);
      const violatesEven = groupTiles.some((t) => (nextState.tiles[t.pos]?.houses ?? 0) > targetHouses);
      if (violatesEven) {
        throw new Error("You must sell buildings evenly across the color group");
      }

      // Hotel degrading check
      const isDegradingHotel = tileState.houses === 5;
      if (isDegradingHotel) {
        // Requires 4 houses to replace the hotel. Check house supply in bank.
        let currentTotalHouses = 0;
        Object.values(nextState.tiles).forEach((ts) => {
          if (ts.houses >= 1 && ts.houses <= 4) {
            currentTotalHouses += ts.houses;
          }
        });

        if (HOUSE_SUPPLY - currentTotalHouses < 4) {
          throw new Error("Not enough houses in the bank to degrade hotel");
        }
      }

      const refund = tile.houseCost / 2;
      currentPlayer.cash += refund;
      tileState.houses -= 1;

      const sellType = tileState.houses === 4 ? "Hotel" : `House ${tileState.houses + 1}`;
      nextState.log.push(
        `${currentPlayer.name} sold a ${sellType} on ${tile.name} for ₦${refund.toLocaleString("en-NG")}.`
      );
      break;
    }

    case "MORTGAGE": {
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot mortgage in phase ${nextState.phase}`);
      }
      const pos = action.pos;
      const tile = BOARD[pos];
      if (!tile || !("mortgage" in tile)) {
        throw new Error(`Tile at position ${pos} is not mortgageable`);
      }

      const tileState = nextState.tiles[pos];
      if (!tileState || tileState.ownerId !== currentPlayer.id) {
        throw new Error("You do not own this property");
      }
      if (tileState.mortgaged) {
        throw new Error("Property is already mortgaged");
      }

      // Property and group must have no buildings
      if (tile.type === "property") {
        const group = tile.group;
        const groupTiles = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === group);
        const hasBuildings = groupTiles.some((t) => (nextState.tiles[t.pos]?.houses ?? 0) > 0);
        if (hasBuildings) {
          throw new Error("Must sell all buildings in the color group before mortgaging");
        }
      }

      tileState.mortgaged = true;
      currentPlayer.cash += tile.mortgage;
      nextState.log.push(`${currentPlayer.name} mortgaged ${tile.name} for ₦${tile.mortgage.toLocaleString("en-NG")}.`);
      break;
    }

    case "UNMORTGAGE": {
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot unmortgage in phase ${nextState.phase}`);
      }
      const pos = action.pos;
      const tile = BOARD[pos];
      if (!tile || !("mortgage" in tile)) {
        throw new Error(`Tile at position ${pos} is not mortgageable`);
      }

      const tileState = nextState.tiles[pos];
      if (!tileState || tileState.ownerId !== currentPlayer.id) {
        throw new Error("You do not own this property");
      }
      if (!tileState.mortgaged) {
        throw new Error("Property is not mortgaged");
      }

      const cost = Math.round(tile.mortgage * 1.1);
      if (currentPlayer.cash < cost) {
        throw new Error(`Insufficient cash to unmortgage (requires ₦${cost})`);
      }

      currentPlayer.cash -= cost;
      tileState.mortgaged = false;
      nextState.log.push(`${currentPlayer.name} unmortgaged ${tile.name} for ₦${cost.toLocaleString("en-NG")}.`);
      break;
    }

    case "PAY_JAIL_FINE": {
      if (!currentPlayer.inJail) {
        throw new Error("Player is not in Jail");
      }
      if (nextState.phase !== "awaiting-roll") {
        throw new Error("Can only pay fine in awaiting-roll phase");
      }
      if (currentPlayer.cash < JAIL_FINE) {
        throw new Error("Insufficient cash to pay jail fine");
      }

      currentPlayer.cash -= JAIL_FINE;
      currentPlayer.inJail = false;
      currentPlayer.jailTurns = 0;
      nextState.log.push(`${currentPlayer.name} paid ₦50,000 fine and was released from Jail.`);
      // Remain in awaiting-roll so the player can take their turn normally
      break;
    }

    case "USE_JAIL_CARD": {
      if (!currentPlayer.inJail) {
        throw new Error("Player is not in Jail");
      }
      if (nextState.phase !== "awaiting-roll") {
        throw new Error("Can only use card in awaiting-roll phase");
      }
      if (currentPlayer.getOutOfJailCards <= 0) {
        throw new Error("Player does not have a Get Out of Jail Free card");
      }

      currentPlayer.getOutOfJailCards -= 1;
      currentPlayer.inJail = false;
      currentPlayer.jailTurns = 0;

      // Put card back in the deck. Check which card (Chance vs Esusu) is missing.
      if (!nextState.chanceOrder.includes("ch07")) {
        nextState.chanceOrder.push("ch07");
      } else {
        nextState.esusuOrder.push("es07");
      }

      nextState.log.push(`${currentPlayer.name} used a Get Out of Jail Free card and was released from Jail.`);
      // Remain in awaiting-roll
      break;
    }

    case "END_TURN": {
      if (nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot end turn in phase ${nextState.phase}`);
      }

      // If player rolled doubles and is not in jail, they get another turn
      if (nextState.doublesCount > 0 && !currentPlayer.inJail) {
        nextState.phase = "awaiting-roll";
        nextState.dice = null; // reset for next roll
        nextState.log.push(`${currentPlayer.name} gets another roll for rolling doubles.`);
      } else {
        // Advance player index
        let nextIndex = (nextState.currentPlayerIndex + 1) % nextState.players.length;
        while (nextState.players[nextIndex].bankrupt) {
          nextIndex = (nextIndex + 1) % nextState.players.length;
        }
        nextState.currentPlayerIndex = nextIndex;
        nextState.doublesCount = 0;
        nextState.dice = null;
        nextState.phase = "awaiting-roll";
        nextState.log.push(`It is now ${nextState.players[nextIndex].name}'s turn.`);
      }
      break;
    }

    case "BID": {
      if (nextState.phase !== "auction" || !nextState.auctionState) {
        throw new Error("No active auction");
      }

      const auction = nextState.auctionState;
      const currentBidderId = auction.activePlayerIds[auction.currentPlayerIndex];
      if (playerId !== currentBidderId) {
        throw new Error(`It is not ${playerId}'s turn to bid in the auction. Current bidder: ${currentBidderId}`);
      }

      const amount = action.amount;
      if (amount <= auction.highestBid) {
        throw new Error(`Bid amount must be higher than current highest bid (₦${auction.highestBid})`);
      }

      const bidder = nextState.players.find((p) => p.id === playerId)!;
      if (bidder.cash < amount) {
        throw new Error(`Insufficient cash (₦${bidder.cash}) for bid ₦${amount}`);
      }

      auction.highestBid = amount;
      auction.highestBidderId = playerId;
      nextState.log.push(`${bidder.name} bid ₦${amount.toLocaleString("en-NG")}.`);

      // Advance to next bidder
      auction.currentPlayerIndex = (auction.currentPlayerIndex + 1) % auction.activePlayerIds.length;

      const nextBidderId = auction.activePlayerIds[auction.currentPlayerIndex];
      const nextBidder = nextState.players.find((p) => p.id === nextBidderId)!;
      nextState.log.push(`It is now ${nextBidder.name}'s turn to bid.`);
      break;
    }

    case "PASS_BID": {
      if (nextState.phase !== "auction" || !nextState.auctionState) {
        throw new Error("No active auction");
      }

      const auction = nextState.auctionState;
      const currentBidderId = auction.activePlayerIds[auction.currentPlayerIndex];
      if (playerId !== currentBidderId) {
        throw new Error(`It is not ${playerId}'s turn to bid in the auction. Current bidder: ${currentBidderId}`);
      }

      const bidder = nextState.players.find((p) => p.id === playerId)!;
      nextState.log.push(`${bidder.name} passed.`);

      // Remove from active bidders
      const removedIndex = auction.currentPlayerIndex;
      auction.activePlayerIds = auction.activePlayerIds.filter((id) => id !== playerId);

      // Check if auction is finished
      if (auction.activePlayerIds.length === 1 && auction.highestBidderId !== null) {
        // Only one bidder remains, and someone has bid
        const winnerId = auction.highestBidderId;
        const winner = nextState.players.find((p) => p.id === winnerId)!;
        const tile = BOARD[auction.tilePos];

        winner.cash -= auction.highestBid;
        nextState.tiles[auction.tilePos].ownerId = winnerId;
        nextState.log.push(
          `${winner.name} won the auction for ${tile.name} for ₦${auction.highestBid.toLocaleString("en-NG")}!`
        );

        nextState.auctionState = null;
        nextState.phase = "awaiting-end-turn";
      } else if (auction.activePlayerIds.length === 0) {
        // Everyone passed with no bids
        const tile = BOARD[auction.tilePos];
        nextState.log.push(`Auction ended with no sale for ${tile.name}.`);

        nextState.auctionState = null;
        nextState.phase = "awaiting-end-turn";
      } else {
        // Bidding continues. Adjust currentPlayerIndex.
        if (removedIndex >= auction.activePlayerIds.length) {
          auction.currentPlayerIndex = 0;
        } else {
          auction.currentPlayerIndex = removedIndex;
        }

        const nextBidderId = auction.activePlayerIds[auction.currentPlayerIndex];
        const nextBidder = nextState.players.find((p) => p.id === nextBidderId)!;
        nextState.log.push(`It is now ${nextBidder.name}'s turn to bid.`);
      }
      break;
    }

    case "PROPOSE_TRADE": {
      // Allowed in roll or end turn phases
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot propose trade in phase ${nextState.phase}`);
      }

      const trade = action.trade;
      if (trade.fromId !== playerId) {
        throw new Error("Proposer ID must match active player");
      }

      const proposer = nextState.players.find((p) => p.id === trade.fromId)!;
      const recipient = nextState.players.find((p) => p.id === trade.toId);
      if (!recipient || recipient.bankrupt) {
        throw new Error("Recipient player not found or bankrupt");
      }

      // Cash checks
      if (trade.giveCash < 0 || trade.getCash < 0) {
        throw new Error("Trade cash values must be non-negative");
      }
      if (proposer.cash < trade.giveCash) {
        throw new Error(`Insufficient cash to propose trade (proposer has ₦${proposer.cash}, offers ₦${trade.giveCash})`);
      }
      if (recipient.cash < trade.getCash) {
        throw new Error(`Recipient has insufficient cash (recipient has ₦${recipient.cash}, requested ₦${trade.getCash})`);
      }

      // Tile checks for proposer
      for (const pos of trade.giveTiles) {
        const ts = nextState.tiles[pos];
        if (!ts || ts.ownerId !== proposer.id) {
          throw new Error(`Proposer does not own tile at pos ${pos}`);
        }
        if (ts.houses > 0) {
          throw new Error(`Cannot trade property with houses built: pos ${pos}`);
        }
      }

      // Tile checks for recipient
      for (const pos of trade.getTiles) {
        const ts = nextState.tiles[pos];
        if (!ts || ts.ownerId !== recipient.id) {
          throw new Error(`Recipient does not own tile at pos ${pos}`);
        }
        if (ts.houses > 0) {
          throw new Error(`Cannot trade property with houses built: pos ${pos}`);
        }
      }

      nextState.activeTrade = trade;
      nextState.log.push(`${proposer.name} proposed a trade to ${recipient.name}.`);
      break;
    }

    case "RESPOND_TRADE": {
      if (!nextState.activeTrade) {
        throw new Error("No active trade proposal");
      }

      const trade = nextState.activeTrade;
      if (playerId !== trade.toId) {
        throw new Error(`Only recipient (${trade.toId}) can respond to trade. Received request from ${playerId}`);
      }

      const proposer = nextState.players.find((p) => p.id === trade.fromId)!;
      const recipient = nextState.players.find((p) => p.id === trade.toId)!;

      if (action.accept) {
        // Double check cash again in case it changed since proposal
        if (proposer.cash < trade.giveCash) {
          throw new Error(`Proposer has insufficient cash (₦${proposer.cash}) to complete trade`);
        }
        if (recipient.cash < trade.getCash) {
          throw new Error(`Recipient has insufficient cash (₦${recipient.cash}) to complete trade`);
        }

        // Execute trade
        proposer.cash = proposer.cash - trade.giveCash + trade.getCash;
        recipient.cash = recipient.cash - trade.getCash + trade.giveCash;

        // Transfer tiles
        for (const pos of trade.giveTiles) {
          nextState.tiles[pos].ownerId = recipient.id;
        }
        for (const pos of trade.getTiles) {
          nextState.tiles[pos].ownerId = proposer.id;
        }

        nextState.log.push(`Trade between ${proposer.name} and ${recipient.name} was accepted.`);
      } else {
        nextState.log.push(`Trade proposal from ${proposer.name} was rejected by ${recipient.name}.`);
      }

      nextState.activeTrade = null;
      break;
    }

    case "DECLARE_BANKRUPT": {
      const bankruptPlayer = nextState.players.find((p) => p.id === playerId)!;
      if (bankruptPlayer.cash >= 0) {
        throw new Error("Cannot declare bankruptcy unless you are in debt (negative cash)");
      }

      bankruptPlayer.bankrupt = true;
      const creditorId = nextState.owedToId || "bank";

      nextState.log.push(`${bankruptPlayer.name} declared bankruptcy!`);

      if (creditorId === "bank") {
        // Return properties to bank (demolish houses, clear ownership)
        Object.keys(nextState.tiles).forEach((posStr) => {
          const pos = parseInt(posStr, 10);
          if (nextState.tiles[pos].ownerId === playerId) {
            nextState.tiles[pos] = {
              ownerId: null,
              houses: 0,
              mortgaged: false,
            };
          }
        });
        nextState.log.push(`All of ${bankruptPlayer.name}'s properties were returned to the bank.`);
      } else {
        const creditor = nextState.players.find((p) => p.id === creditorId)!;

        // Transfer remaining properties to creditor
        Object.keys(nextState.tiles).forEach((posStr) => {
          const pos = parseInt(posStr, 10);
          if (nextState.tiles[pos].ownerId === playerId) {
            nextState.tiles[pos].ownerId = creditorId;
            // Demolish houses
            nextState.tiles[pos].houses = 0;
            // Mortgaged status remains the same
          }
        });

        // Transfer remaining cash if positive
        if (bankruptPlayer.cash > 0) {
          creditor.cash += bankruptPlayer.cash;
        }

        nextState.log.push(`All of ${bankruptPlayer.name}'s properties were transferred to ${creditor.name}.`);
      }

      // Clean up debt tracking
      nextState.owedToId = null;

      // Check win condition
      const activePlayers = nextState.players.filter((p) => !p.bankrupt);
      if (activePlayers.length === 1) {
        nextState.winnerId = activePlayers[0].id;
        nextState.phase = "game-over";
        nextState.log.push(`${activePlayers[0].name} has won the game!`);
      } else {
        // If the bankrupt player was the current player, we must advance turn!
        if (nextState.currentPlayerIndex === state.currentPlayerIndex) {
          // Bankrupt player ended their turn by going bankrupt
          let nextIndex = (nextState.currentPlayerIndex + 1) % nextState.players.length;
          while (nextState.players[nextIndex].bankrupt) {
            nextIndex = (nextIndex + 1) % nextState.players.length;
          }
          nextState.currentPlayerIndex = nextIndex;
          nextState.doublesCount = 0;
          nextState.dice = null;
          nextState.phase = "awaiting-roll";
          nextState.log.push(`It is now ${nextState.players[nextIndex].name}'s turn.`);
        }
      }
      break;
    }

    default:
      throw new Error(`Action type ${(action as { type: string }).type} is not implemented yet`);
  }

  return nextState;
}

function movePlayerAndResolve(
  state: GameState,
  player: Player,
  steps: number,
  rng: () => number,
): void {
  const currentPos = player.position;
  const newPos = (currentPos + steps) % 40;

  if (newPos < currentPos) {
    player.cash += GO_SALARY;
    state.log.push(`${player.name} passed START and collected ₦200,000.`);
  }

  player.position = newPos;
  resolveLanding(state, player, newPos, 1, rng);
}

function resolveLanding(
  state: GameState,
  player: Player,
  pos: number,
  rentMultiplier: number,
  rng: () => number,
): void {
  const tile = BOARD[pos];

  if (tile.type === "property" || tile.type === "airport" || tile.type === "utility") {
    const tileState = state.tiles[pos];
    if (tileState.ownerId === null) {
      state.phase = "awaiting-buy-decision";
    } else if (tileState.ownerId === player.id) {
      state.log.push(`${player.name} landed on their own property: ${tile.name}.`);
      state.phase = "awaiting-end-turn";
    } else {
      // Landed on another player's property - pay rent!
      if (tileState.mortgaged) {
        state.log.push(`${player.name} landed on ${tile.name} (owned by ${tileState.ownerId}), but it is mortgaged.`);
        state.phase = "awaiting-end-turn";
      } else {
        let rent = getRent(state, pos, state.dice ? (state.dice[0] + state.dice[1]) : 0);
        if (tile.type === "airport" && rentMultiplier === 2) {
          rent *= 2;
        }

        player.cash -= rent;
        if (player.cash < 0) {
          state.owedToId = tileState.ownerId;
        }
        const owner = state.players.find((p) => p.id === tileState.ownerId)!;
        owner.cash += rent;

        state.log.push(
          `${player.name} paid ₦${rent.toLocaleString("en-NG")} rent to ${owner.name} for landing on ${tile.name}.`
        );
        state.phase = "awaiting-end-turn";
      }
    }
  } else if (tile.type === "tax") {
    player.cash -= tile.amount;
    if (player.cash < 0) {
      state.owedToId = "bank";
    }
    state.log.push(`${player.name} paid ₦${tile.amount.toLocaleString("en-NG")} for ${tile.name}.`);
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "jail") {
    state.log.push(`${player.name} is just visiting Kirikiri Prison.`);
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "free") {
    state.log.push(`${player.name} landed on Bukka Rest Stop (Free Parking).`);
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "gotojail") {
    player.inJail = true;
    player.jailTurns = 0;
    player.position = JAIL_POSITION;
    state.doublesCount = 0;
    state.log.push(`${player.name} was sent to Kirikiri Prison!`);
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "chance" || tile.type === "esusu") {
    drawCard(state, player, tile.type, rng);
  } else if (tile.type === "go") {
    state.log.push(`${player.name} landed on START.`);
    state.phase = "awaiting-end-turn";
  }
}

function drawCard(
  state: GameState,
  player: Player,
  type: "chance" | "esusu",
  rng: () => number,
): void {
  const isChance = type === "chance";
  const order = isChance ? state.chanceOrder : state.esusuOrder;
  const ptr = isChance ? state.chancePtr : state.esusuPtr;
  const deck = isChance ? CHANCE_CARDS : ESUSU_CARDS;

  if (order.length === 0) {
    throw new Error(`The ${type} deck is empty`);
  }

  const cardId = order[ptr];
  const card = deck.find((c) => c.id === cardId);
  if (!card) {
    throw new Error(`Card not found in deck: ${cardId}`);
  }

  state.log.push(`${player.name} drew ${isChance ? "Chance" : "Esusu"}: "${card.text}"`);

  // Manage pointer and deck arrays
  let nextPtr = ptr;
  if (card.action.kind === "getOutOfJailFree") {
    const nextOrder = order.filter((id) => id !== cardId);
    if (isChance) {
      state.chanceOrder = nextOrder;
    } else {
      state.esusuOrder = nextOrder;
    }
    nextPtr = nextOrder.length > 0 ? ptr % nextOrder.length : 0;
  } else {
    nextPtr = (ptr + 1) % order.length;
  }

  if (isChance) {
    state.chancePtr = nextPtr;
  } else {
    state.esusuPtr = nextPtr;
  }

  applyCardAction(state, player, card.action, rng);
}

function applyCardAction(
  state: GameState,
  player: Player,
  action: typeof CHANCE_CARDS[0]["action"],
  rng: () => number,
): void {
  switch (action.kind) {
    case "money": {
      player.cash += action.amount;
      if (player.cash < 0) {
        state.owedToId = "bank";
      }
      const verb = action.amount >= 0 ? "received" : "lost";
      const amtAbs = Math.abs(action.amount);
      state.log.push(`${player.name} ${verb} ₦${amtAbs.toLocaleString("en-NG")}.`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "moveTo": {
      const currentPos = player.position;
      const targetPos = action.pos;
      if (action.collectIfPass && targetPos < currentPos) {
        player.cash += GO_SALARY;
        state.log.push(`${player.name} passed START and collected ₦200,000.`);
      }
      player.position = targetPos;
      state.log.push(`${player.name} moved to ${BOARD[targetPos].name}.`);
      resolveLanding(state, player, targetPos, 1, rng);
      break;
    }

    case "moveRelative": {
      const targetPos = (player.position + action.steps + 40) % 40;
      player.position = targetPos;
      state.log.push(`${player.name} moved to ${BOARD[targetPos].name}.`);
      resolveLanding(state, player, targetPos, 1, rng);
      break;
    }

    case "goToJail": {
      player.inJail = true;
      player.jailTurns = 0;
      player.position = JAIL_POSITION;
      state.doublesCount = 0;
      state.log.push(`${player.name} was sent to Kirikiri Prison!`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "getOutOfJailFree": {
      player.getOutOfJailCards += 1;
      state.log.push(`${player.name} received a Get Out of Jail Free card.`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "collectFromEach": {
      let totalCollected = 0;
      state.players.forEach((p) => {
        if (p.id !== player.id && !p.bankrupt) {
          p.cash -= action.amount;
          if (p.cash < 0 && !state.owedToId) {
            state.owedToId = player.id;
          }
          totalCollected += action.amount;
          state.log.push(`${p.name} paid ₦${action.amount.toLocaleString("en-NG")} to ${player.name}.`);
        }
      });
      player.cash += totalCollected;
      state.phase = "awaiting-end-turn";
      break;
    }

    case "payEach": {
      state.players.forEach((p) => {
        if (p.id !== player.id && !p.bankrupt) {
          p.cash += action.amount;
          player.cash -= action.amount;
          if (player.cash < 0 && !state.owedToId) {
            state.owedToId = p.id;
          }
          state.log.push(`${player.name} paid ₦${action.amount.toLocaleString("en-NG")} to ${p.name}.`);
        }
      });
      state.phase = "awaiting-end-turn";
      break;
    }

    case "repairs": {
      let housesCount = 0;
      let hotelsCount = 0;

      Object.values(state.tiles).forEach((tileState) => {
        if (tileState.ownerId === player.id) {
          if (tileState.houses === 5) {
            hotelsCount += 1;
          } else if (tileState.houses >= 1 && tileState.houses <= 4) {
            housesCount += tileState.houses;
          }
        }
      });

      const totalCost = housesCount * action.perHouse + hotelsCount * action.perHotel;
      player.cash -= totalCost;
      if (player.cash < 0) {
        state.owedToId = "bank";
      }
      state.log.push(
        `${player.name} paid ₦${totalCost.toLocaleString("en-NG")} for property repairs (${housesCount} houses, ${hotelsCount} hotels).`
      );
      state.phase = "awaiting-end-turn";
      break;
    }

    case "nearestAirport": {
      const airports = [5, 15, 25, 35];
      let targetPos = airports.find((pos) => pos > player.position);
      if (targetPos === undefined) {
        targetPos = 5;
      }

      const currentPos = player.position;
      if (targetPos < currentPos) {
        player.cash += GO_SALARY;
        state.log.push(`${player.name} passed START and collected ₦200,000.`);
      }

      player.position = targetPos;
      state.log.push(`${player.name} moved to nearest Airport: ${BOARD[targetPos].name}.`);
      resolveLanding(state, player, targetPos, 2, rng);
      break;
    }

    case "nearestUtility": {
      const utilities = [12, 28];
      let targetPos = utilities.find((pos) => pos > player.position);
      if (targetPos === undefined) {
        targetPos = 12;
      }

      const currentPos = player.position;
      if (targetPos < currentPos) {
        player.cash += GO_SALARY;
        state.log.push(`${player.name} passed START and collected ₦200,000.`);
      }

      player.position = targetPos;
      state.log.push(`${player.name} moved to nearest Utility: ${BOARD[targetPos].name}.`);

      const tileState = state.tiles[targetPos];
      if (tileState.ownerId !== null && tileState.ownerId !== player.id && !tileState.mortgaged) {
        // Roll dice and pay 10x roll
        const rd1 = Math.floor(rng() * 6) + 1;
        const rd2 = Math.floor(rng() * 6) + 1;
        const diceTotal = rd1 + rd2;
        const rent = diceTotal * 10;

        const owner = state.players.find((p) => p.id === tileState.ownerId)!;
        player.cash -= rent;
        if (player.cash < 0) {
          state.owedToId = owner.id;
        }
        owner.cash += rent;

        state.log.push(
          `${player.name} rolled [${rd1}, ${rd2}] for utility rent. Paid ₦${rent.toLocaleString("en-NG")} to ${owner.name}.`
        );
        state.phase = "awaiting-end-turn";
      } else {
        resolveLanding(state, player, targetPos, 1, rng);
      }
      break;
    }

    default:
      throw new Error(`Card action kind is not implemented yet`);
  }
}
