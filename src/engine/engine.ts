// =============================================================================
// engine/engine.ts — the pure game engine.
//
// Implement these as pure functions: given state + action, return NEW state.
// Never mutate inputs. The server and the tests both call applyAction.
// =============================================================================

import {
  BOARD,
  CHANCE_CARDS,
  CHAOS_CHANCE_CARDS,
  ALL_CHANCE_CARDS,
  HUSTLE_CARDS,
  STARTING_CASH,
  GO_SALARY,
  JAIL_POSITION,
  JAIL_FINE,
  HOUSE_SUPPLY,
  HOTEL_SUPPLY,
  AUCTION_BID_DURATION_MS,
  auctionIncrements,
  type PropertyTile,
} from "../data/board";
import type { Action, GameState, PlayerId, TileState, Player, GameSettings, Objective, DebtRecord } from "./types";

// Move the turn to the next non-bankrupt player and reset per-turn state.
// Used when the active player can no longer act (e.g. forfeited a turn by
// leaving). Does not handle round/turn-limit accounting — that lives in
// END_TURN, which is the normal path for completing a turn.
function advanceTurnSkippingBankrupt(state: GameState): void {
  let nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  let guard = 0;
  while (state.players[nextIndex].bankrupt && guard < state.players.length) {
    nextIndex = (nextIndex + 1) % state.players.length;
    guard++;
  }
  state.currentPlayerIndex = nextIndex;
  state.doublesCount = 0;
  state.dice = null;
  state.phase = "awaiting-roll";
  state.log.push(`It is now ${state.players[nextIndex].name}'s turn.`);
  evaluateObjectivesAtBoundary(state);
}

// Award the auctioned tile to the standing high bidder (or close with no sale),
// then hand the turn back. Shared by BID / PASS_BID / RESOLVE_AUCTION.
function finalizeAuction(state: GameState): void {
  const auction = state.auctionState;
  if (!auction) return;
  const tile = BOARD[auction.tilePos];
  if (auction.highestBidderId !== null) {
    const winner = state.players.find((p) => p.id === auction.highestBidderId)!;
    winner.cash -= auction.highestBid;
    state.bank += auction.highestBid;
    state.tiles[auction.tilePos] = { ownerId: winner.id, houses: 0, mortgaged: false };
    state.stats[winner.id].propertiesBought += 1;
    state.log.push(
      `${winner.name} won the auction for ${tile.name} for ₦${auction.highestBid.toLocaleString("en-NG")}!`,
    );
  } else {
    state.log.push(`Auction ended with no sale for ${tile.name}.`);
  }
  state.auctionState = null;
  state.phase = "awaiting-end-turn";
  // The decliner who triggered the auction may have left mid-auction; never
  // strand the turn on a bankrupt player.
  if (state.players[state.currentPlayerIndex].bankrupt) {
    advanceTurnSkippingBankrupt(state);
  }
}

// Award the one-shot secret-objective bonus. Called ONLY at a turn boundary
// (turn passes to the next player, or the game ends), never after arbitrary
// mid-turn actions. INVARIANT (owner): the predicate must be TRUE *AT* the
// boundary — not "was ever true during the turn." All predicates below
// recompute from live state and never latch, so a player who crosses a
// threshold mid-turn and drops back before the boundary correctly gets nothing.
// Bails if an auction or trade is still pending so cash is never injected into
// an open auction/trade; evaluation defers to the next clean boundary.
function evaluateObjectivesAtBoundary(state: GameState): void {
  if (!state.settings.secretObjectives) return;
  if (state.phase === "auction" || state.auctionState) return;
  if (state.activeTrade) return;
  if (state.debtLedger && state.debtLedger.length > 0) return; // bail if any debt unsettled

  state.players.forEach(p => {
    if (p.secretObjective && !p.objectiveCompleted && !p.bankrupt) {
      let completed = false;
      switch (p.secretObjective) {
        case "own_2_airports":
          completed = BOARD.filter(t => t.type === "airport" && state.tiles[t.pos]?.ownerId === p.id).length >= 2;
          break;
        case "complete_color_set": {
          const groups = new Set(BOARD.filter(t => t.type === "property" && state.tiles[t.pos]?.ownerId === p.id).map(t => (t as PropertyTile).group));
          for (const g of groups) {
             const allInGroup = BOARD.filter(t => t.type === "property" && (t as PropertyTile).group === g);
             if (allInGroup.every(t => state.tiles[t.pos]?.ownerId === p.id)) {
               completed = true;
               break;
             }
          }
          break;
        }
        case "cash_2m":
          if (p.cash >= 2_000_000) completed = true;
          break;
        case "own_4_properties":
          completed = BOARD.filter(t => (t.type === "property" || t.type === "airport" || t.type === "utility") && state.tiles[t.pos]?.ownerId === p.id).length >= 4;
          break;
        case "first_hotel":
          completed = BOARD.some(t => t.type === "property" && state.tiles[t.pos]?.ownerId === p.id && state.tiles[t.pos]?.houses === 5);
          break;
      }
      if (completed) {
        p.objectiveCompleted = true;
        p.cash += 500_000;
        state.bank -= 500_000;
        state.log.push(`${p.name} completed their secret objective and earned ₦500,000!`);
      }
    }
  });
}

// Remove an eliminated player from vote-kick bookkeeping: they can no longer
// be a live voter in kicks against others, nor a valid target. Used by both
// FORFEIT and DECLARE_BANKRUPT so ghost votes/targets never linger.
function pruneVoteKicks(state: GameState, eliminatedPlayerId: PlayerId): void {
  delete state.votekicks[eliminatedPlayerId];
  for (const targetId of Object.keys(state.votekicks)) {
    state.votekicks[targetId] = state.votekicks[targetId].filter((id) => id !== eliminatedPlayerId);
  }
}

// Helper: Shuffles an array using Fisher-Yates and the injected rng
function shuffle<T>(array: T[], rng: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getDevelopmentName(houses: number): string {
  switch (houses) {
    case 0: return "Vacant Land";
    case 1: return "Bungalow";
    case 2: return "Duplex";
    case 3: return "Mansion";
    case 4: return "Mini-Estate";
    case 5: return "Hotel";
    default: return "Unknown";
  }
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

const DEFAULT_SETTINGS: GameSettings = {
  startingCash: STARTING_CASH,
  turnLimit: 0,
  freeParkingJackpot: false,
  chaosMode: false,
};

export function createGame(
  playerIds: PlayerId[],
  settings?: Partial<GameSettings>,
  rng: () => number = Math.random,
): GameState {
  if (playerIds.length < 2) {
    throw new Error("A game must have at least 2 players");
  }

  const mergedSettings: GameSettings = {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
  };

  const AI_STYLES = ["AggressiveBidder", "PropertyHoarder", "Builder", "CashSaver", "Trader", "Normal"] as const;
  const OBJECTIVES: Objective[] = ["own_2_airports", "complete_color_set", "cash_2m", "own_4_properties", "first_hotel"];

  const players: Player[] = playerIds.map((id, index) => ({
    id,
    name: `Player ${index + 1}`,
    cash: mergedSettings.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCardSources: [],
    bankrupt: false,
    order: index,
    aiStyle: id.startsWith("ai_") ? AI_STYLES[Math.floor(rng() * AI_STYLES.length)] : undefined,
    secretObjective: mergedSettings.secretObjectives ? OBJECTIVES[Math.floor(rng() * OBJECTIVES.length)] : undefined,
    objectiveCompleted: false,
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

  const stats: Record<PlayerId, { rentPaid: number; highestAuctionBid: number; propertiesBought: number; jailTimes: number }> = {};
  playerIds.forEach(id => {
    stats[id] = { rentPaid: 0, highestAuctionBid: 0, propertiesBought: 0, jailTimes: 0 };
  });

  // Chaos mode mixes the chaos cards (e.g. NEPA blackout) into the Chance deck.
  const chancePool = mergedSettings.chaosMode
    ? [...CHANCE_CARDS, ...CHAOS_CHANCE_CARDS]
    : CHANCE_CARDS;
  const chanceOrder = shuffle(chancePool.map((c) => c.id), rng);
  const hustleOrder = shuffle(HUSTLE_CARDS.map((c) => c.id), rng);

  return {
    players,
    currentPlayerIndex: 0,
    tiles,
    phase: "awaiting-roll",
    dice: null,
    doublesCount: 0,
    chanceOrder,
    hustleOrder,
    chancePtr: 0,
    hustlePtr: 0,
    log: ["The game has started!"],
    winnerId: null,
    settings: mergedSettings,
    currentTurn: 1,
    freeParkingPot: 0,
    blackout: null,
    debtLedger: [],
    votekicks: {},
    stats,
    bank: -(playerIds.length * mergedSettings.startingCash),
  };
}

// ---------------------------------------------------------------------------
// Debt-ledger helpers
// ---------------------------------------------------------------------------

/**
 * Add a debt from a debtor to a creditor. If the debtor is solvent (can
 * cover the full amount right now), transfer immediately — no DebtRecord,
 * no UX change. Only record a DebtRecord when the debtor is insolvent.
 *
 * For non-current players (e.g. victims of collectFromEach), insolvency
 * is auto-settled inline: they pay min(cash, owed), shortfall written off,
 * NO forced bankruptcy on someone else's turn.
 */
function addDebt(
  state: GameState,
  debtorId: PlayerId,
  creditorId: PlayerId | "bank",
  amount: number,
): void {
  if (amount <= 0) return;

  const debtor = state.players.find(p => p.id === debtorId)!;
  const isCurrentPlayer = state.players[state.currentPlayerIndex].id === debtorId;

  if (debtor.cash >= amount) {
    // Solvent: transfer immediately, no DebtRecord
    debtor.cash -= amount;
    if (creditorId === "bank") {
      state.bank += amount;
    } else if (creditorId === "pot") {
      state.freeParkingPot += amount;
    } else {
      const creditor = state.players.find(p => p.id === creditorId);
      if (creditor && !creditor.bankrupt) {
        creditor.cash += amount;
      } else {
        // If creditor is bankrupt/gone, money goes to bank (vanishes from player pool)
        state.bank += amount;
      }
    }
  } else if (isCurrentPlayer) {
    // Current player is insolvent: record a DebtRecord.
    // Do NOT deduct cash or pay creditor — that happens at settlement
    // (DECLARE_BANKRUPT or after they sell/mortgage enough to cover it).
    state.debtLedger.push({ debtorId, creditorId, amount });
  } else {
    // Non-current player is insolvent (e.g. collectFromEach victim):
    // Auto-settle inline — pay what they can, write off the shortfall.
    const actualPayout = Math.max(0, debtor.cash);
    debtor.cash -= actualPayout; // goes to 0
    if (creditorId === "bank") {
      state.bank += actualPayout;
    } else if (creditorId === "pot") {
      state.freeParkingPot += actualPayout;
    } else if (actualPayout > 0) {
      const creditor = state.players.find(p => p.id === creditorId);
      if (creditor && !creditor.bankrupt) {
        creditor.cash += actualPayout;
      } else {
        state.bank += actualPayout;
      }
    }
    // Shortfall is written off — genuinely gone, nothing minted.
    const shortfall = amount - actualPayout;
    if (shortfall > 0) {
      state.log.push(`₦${shortfall.toLocaleString("en-NG")} shortfall written off (${debtor.name} is insolvent).`);
    }
  }
}

/**
 * Force-settle all debts for a player (used at DECLARE_BANKRUPT).
 * Pays creditors up to the debtor's remaining cash, checks creditor liveness,
 * and writes off any shortfall.
 *
 * @returns the total cash actually paid out to creditors.
 */
function settleDebtsForPlayer(state: GameState, debtorId: PlayerId): number {
  const debtor = state.players.find(p => p.id === debtorId)!;
  let totalPaid = 0;

  // Settle each debt in order
  const debts = state.debtLedger.filter(d => d.debtorId === debtorId);
  for (const debt of debts) {
    const available = Math.max(0, debtor.cash);
    const payout = Math.min(debt.amount, available);

    // Resolve creditor liveness at settlement time
    let resolvedCreditorId = debt.creditorId;
    if (resolvedCreditorId !== "bank" && resolvedCreditorId !== "pot") {
      const creditor = state.players.find(p => p.id === resolvedCreditorId);
      if (!creditor || creditor.bankrupt) {
        resolvedCreditorId = "bank"; // reroute to bank
      }
    }

    if (payout > 0) {
      debtor.cash -= payout;
      if (resolvedCreditorId === "bank") {
        state.bank += payout;
      } else if (resolvedCreditorId === "pot") {
        state.freeParkingPot += payout;
      } else {
        const creditor = state.players.find(p => p.id === resolvedCreditorId)!;
        creditor.cash += payout;
      }
      totalPaid += payout;
    }

    const shortfall = debt.amount - payout;
    if (shortfall > 0) {
      state.log.push(`₦${shortfall.toLocaleString("en-NG")} debt written off.`);
    }
  }

  // Remove all settled debts from the ledger
  state.debtLedger = state.debtLedger.filter(d => d.debtorId !== debtorId);
  return totalPaid;
}

/**
 * Write off all debts owed BY a player (forfeit/kick — assets go to bank,
 * creditors get nothing) and reroute any debts owed TO this player to the bank.
 */
function forceWriteOffDebts(state: GameState, playerId: PlayerId): void {
  // Write off debts they owe (creditors get nothing)
  const owedDebts = state.debtLedger.filter(d => d.debtorId === playerId);
  for (const debt of owedDebts) {
    if (debt.amount > 0) {
      state.log.push(`₦${debt.amount.toLocaleString("en-NG")} debt written off (${state.players.find(p => p.id === playerId)!.name} left the game).`);
    }
  }
  state.debtLedger = state.debtLedger.filter(d => d.debtorId !== playerId);

  // Reroute debts owed TO this player to the bank
  state.debtLedger.forEach(d => {
    if (d.creditorId === playerId) {
      d.creditorId = "bank";
    }
  });
}

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  rng: () => number = Math.random,
): GameState {
  // Deep copy state to maintain purity
  const nextState: GameState = structuredClone(state);

  const currentPlayer = nextState.players[nextState.currentPlayerIndex];
  if (!currentPlayer) {
    throw new Error("No current player found");
  }

  // Validate player turn (unless declaring bankruptcy when bankrupt, bidding in auction, or responding to trade)
  // Auction actions are open to any participant; RESOLVE_AUCTION is a server-only timer event.
  const isAuctionAction =
    action.type === "BID" || action.type === "PASS_BID" || action.type === "RESOLVE_AUCTION";
  const isTradeResponse = action.type === "RESPOND_TRADE";
  // A disconnect can land on any player at any time, not just the active one.
  const isForfeit = action.type === "FORFEIT";
  const isVoteKick = action.type === "VOTE_KICK";

  if (playerId !== currentPlayer.id && !isAuctionAction && !isTradeResponse && !isForfeit && !isVoteKick) {
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
            if (nextState.settings.freeParkingJackpot) {
              nextState.freeParkingPot += JAIL_FINE;
              nextState.log.push(
                `${currentPlayer.name} failed to roll doubles for the 3rd time in Jail. Paid ₦50,000 fine (added to Mama Put Pot) and moved.`
              );
            } else {
              nextState.bank += JAIL_FINE;
              nextState.log.push(
                `${currentPlayer.name} failed to roll doubles for the 3rd time in Jail. Paid ₦50,000 fine and moved.`
              );
            }

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
            nextState.stats[currentPlayer.id].jailTimes += 1;
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
      nextState.bank += tile.price;
      nextState.tiles[pos] = { ownerId: currentPlayer.id, houses: 0, mortgaged: false };
      nextState.stats[currentPlayer.id].propertiesBought += 1;
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

      const price = "price" in tile ? (tile as PropertyTile).price : 0;
      const { minIncrement, bidIncrements } = auctionIncrements(price);

      nextState.auctionState = {
        tilePos: pos,
        highestBid: 0,
        highestBidderId: null,
        participantIds: activePlayers.map((p) => p.id),
        passedIds: [],
        minIncrement,
        bidIncrements,
        bidDurationMs: AUCTION_BID_DURATION_MS,
        deadline: null, // the server stamps this when it arms the timer
      };
      nextState.phase = "auction";

      nextState.log.push(
        `Auction started for ${tile.name}! Bidding is open — raise fast before the clock runs out.`,
      );
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
        throw new Error("Property is already fully developed (Hotel)");
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
          throw new Error("No Hotels remaining in the bank");
        }
      } else {
        // consumes 1 house
        if (currentTotalHouses >= HOUSE_SUPPLY) {
          throw new Error("No Bungalows/Duplexes/Mansions/Estates remaining in the bank");
        }
      }

      // Cash check
      if (currentPlayer.cash < tile.houseCost) {
        throw new Error(`Insufficient cash to build (requires ₦${tile.houseCost})`);
      }

      currentPlayer.cash -= tile.houseCost;
      nextState.bank += tile.houseCost;
      tileState.houses += 1;

      const buildType = getDevelopmentName(tileState.houses);
      nextState.log.push(`${currentPlayer.name} built a ${buildType} on ${tile.name} for ₦${tile.houseCost.toLocaleString("en-NG")}.`);
      break;
    }

    case "SELL_HOUSE": {
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot sell developments in phase ${nextState.phase}`);
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
          throw new Error("Not enough Bungalows/Duplexes in the bank to downgrade Hotel");
        }
      }

      // Sell back to the bank at half price. Floor keeps money an exact integer
      // of Naira even if a retheme sets an odd houseCost (data is data).
      const refund = Math.floor(tile.houseCost / 2);
      currentPlayer.cash += refund;
      nextState.bank -= refund;
      tileState.houses -= 1;

      const sellType = getDevelopmentName(tileState.houses + 1);
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
      nextState.bank -= tile.mortgage;
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
      nextState.bank += cost;
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
      if (nextState.settings.freeParkingJackpot) {
        nextState.freeParkingPot += JAIL_FINE;
        nextState.log.push(`${currentPlayer.name} paid ₦50,000 fine (added to Mama Put Pot) and was released from Jail.`);
      } else {
        nextState.bank += JAIL_FINE;
        nextState.log.push(`${currentPlayer.name} paid ₦50,000 fine and was released from Jail.`);
      }
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
      if (currentPlayer.jailCardSources.length <= 0) {
        throw new Error("Player does not have a Get Out of Jail Free card");
      }

      const source = currentPlayer.jailCardSources.pop()!;
      currentPlayer.inJail = false;
      currentPlayer.jailTurns = 0;

      // Restore the card to whichever deck it originally came from.
      if (source === "chance") {
        nextState.chanceOrder.push("ch07");
      } else {
        nextState.hustleOrder.push("es07");
      }

      nextState.log.push(`${currentPlayer.name} used a Get Out of Jail Free card and was released from Jail.`);
      // Remain in awaiting-roll
      break;
    }

    case "END_TURN": {
      if (nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot end turn in phase ${nextState.phase}`);
      }

      // Block if the current player has unsettled debts in the ledger
      const playerDebts = nextState.debtLedger.filter(d => d.debtorId === currentPlayer.id);
      if (playerDebts.length > 0) {
        throw new Error("Cannot end turn with unsettled debts. You must mortgage properties, sell houses, or declare bankruptcy.");
      }

      if (currentPlayer.cash < 0) {
        throw new Error("Cannot end turn with negative cash. You must mortgage properties, sell houses, or declare bankruptcy.");
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

        // Did we complete a round?
        if (nextIndex < nextState.currentPlayerIndex) {
          // Yes, we wrapped around. Check turn limit BEFORE incrementing round count to limit current round play
          if (nextState.settings.turnLimit > 0 && nextState.currentTurn >= nextState.settings.turnLimit) {
            // Game over! Calculate winner by net worth
            const solventPlayers = nextState.players.filter(p => !p.bankrupt);
            let highestNetWorth = -Infinity;
            let winnerId: string | null = null;
            
            nextState.log.push("Turn limit reached! Calculating player net worths...");
            
            solventPlayers.forEach(p => {
              // Cash
              let netWorth = p.cash;
              
              // Value of all properties owned by this player
              Object.keys(nextState.tiles).forEach(posStr => {
                const pos = parseInt(posStr, 10);
                const ts = nextState.tiles[pos];
                if (ts.ownerId === p.id) {
                  const tile = BOARD[pos];
                  if ("price" in tile) {
                    if (ts.mortgaged) {
                      // Mortgaged properties have value = mortgage amount
                      netWorth += tile.mortgage;
                    } else {
                      // Unmortgaged properties have full purchase value
                      netWorth += tile.price;
                      // Plus development costs
                      if (tile.type === "property" && ts.houses > 0) {
                        netWorth += ts.houses * tile.houseCost;
                      }
                    }
                  }
                }
              });

              // Subtract any pending debts this player owes
              const pendingDebts = nextState.debtLedger
                .filter(d => d.debtorId === p.id)
                .reduce((sum, d) => sum + d.amount, 0);
              netWorth -= pendingDebts;
              
              nextState.log.push(`${p.name}'s Net Worth: ₦${netWorth.toLocaleString("en-NG")}`);
              
              if (netWorth > highestNetWorth) {
                highestNetWorth = netWorth;
                winnerId = p.id;
              }
            });
            
            if (winnerId) {
              const winnerName = nextState.players.find(p => p.id === winnerId)!.name;
              nextState.winnerId = winnerId;
              nextState.phase = "game-over";
              nextState.log.push(`Turn limit of ${nextState.settings.turnLimit} rounds was reached! ${winnerName} wins the game with a net worth of ₦${highestNetWorth.toLocaleString("en-NG")}!`);
              evaluateObjectivesAtBoundary(nextState);
              return nextState;
            }
          }

          nextState.currentTurn += 1;
          nextState.log.push(`--- Round ${nextState.currentTurn} ---`);

          // NEPA restores light once the round has wrapped past the blackout.
          if (nextState.blackout && nextState.currentTurn >= nextState.blackout.untilRound) {
            nextState.blackout = null;
            nextState.log.push(`💡 Light don restore! Rent dey collect again.`);
          }
          if (nextState.airportStrike && nextState.currentTurn >= nextState.airportStrike.untilRound) {
            nextState.airportStrike = null;
            nextState.log.push(`🛬 Aviation workers don resume work! Airport rent dey collect again.`);
          }
        }

        nextState.currentPlayerIndex = nextIndex;
        nextState.doublesCount = 0;
        nextState.dice = null;
        nextState.phase = "awaiting-roll";
        nextState.log.push(`It is now ${nextState.players[nextIndex].name}'s turn.`);
        evaluateObjectivesAtBoundary(nextState);
      }
      break;
    }

    case "BID": {
      if (nextState.phase !== "auction" || !nextState.auctionState) {
        throw new Error("No active auction");
      }

      const auction = nextState.auctionState;
      if (!auction.participantIds.includes(playerId)) {
        throw new Error(`${playerId} is not part of this auction`);
      }
      if (auction.passedIds.includes(playerId)) {
        throw new Error(`${playerId} has already passed and cannot bid again`);
      }
      if (auction.highestBidderId === playerId) {
        throw new Error(`${playerId} is already the highest bidder`);
      }

      // Bids must raise the top bid by exactly one of the set increments.
      const amount = action.amount;
      if (!Number.isInteger(amount)) {
        throw new Error("Bid amount must be a whole number");
      }
      const raise = amount - auction.highestBid;
      if (!auction.bidIncrements.includes(raise)) {
        throw new Error(
          `Bid must raise by a set increment (${auction.bidIncrements
            .map((i) => `₦${i.toLocaleString("en-NG")}`)
            .join(", ")})`,
        );
      }

      const bidder = nextState.players.find((p) => p.id === playerId)!;
      if (bidder.cash < amount) {
        throw new Error(`Insufficient cash (₦${bidder.cash}) for bid ₦${amount}`);
      }

      auction.highestBid = amount;
      auction.highestBidderId = playerId;
      auction.deadline = null; // the server resets the clock on each new bid
      nextState.log.push(`${bidder.name} bid ₦${amount.toLocaleString("en-NG")}!`);
      
      if (amount > nextState.stats[playerId].highestAuctionBid) {
        nextState.stats[playerId].highestAuctionBid = amount;
      }

      // If nobody else is still in the running, the bidder wins immediately.
      const challengers = auction.participantIds.filter(
        (id) => id !== playerId && !auction.passedIds.includes(id),
      );
      if (challengers.length === 0) {
        finalizeAuction(nextState);
      }
      break;
    }

    case "PASS_BID": {
      if (nextState.phase !== "auction" || !nextState.auctionState) {
        throw new Error("No active auction");
      }

      const auction = nextState.auctionState;
      if (!auction.participantIds.includes(playerId)) {
        throw new Error(`${playerId} is not part of this auction`);
      }
      if (auction.passedIds.includes(playerId)) {
        throw new Error(`${playerId} has already passed`);
      }
      if (auction.highestBidderId === playerId) {
        throw new Error(`The highest bidder cannot pass`);
      }

      const bidder = nextState.players.find((p) => p.id === playerId)!;
      auction.passedIds.push(playerId);
      nextState.log.push(`${bidder.name} passed.`);

      // Who is still able to bid?
      const remaining = auction.participantIds.filter(
        (id) => !auction.passedIds.includes(id),
      );
      if (auction.highestBidderId !== null) {
        // Someone has bid; once no challenger is left, the top bidder wins.
        const challengers = remaining.filter((id) => id !== auction.highestBidderId);
        if (challengers.length === 0) {
          finalizeAuction(nextState);
        }
      } else if (remaining.length === 0) {
        // Everyone folded without a single bid.
        finalizeAuction(nextState);
      }
      break;
    }

    case "RESOLVE_AUCTION": {
      // Fired by the server when the bid timer expires: award to the standing
      // high bidder, or close with no sale if no one ever bid.
      if (nextState.phase !== "auction" || !nextState.auctionState) {
        throw new Error("No active auction");
      }
      finalizeAuction(nextState);
      break;
    }

    case "PROPOSE_TRADE": {
      // Allowed in roll or end turn phases
      if (nextState.phase !== "awaiting-roll" && nextState.phase !== "awaiting-end-turn") {
        throw new Error(`Cannot propose trade in phase ${nextState.phase}`);
      }

      const trade = action.trade;
      // Shape validation: the wire payload is attacker-controlled, so reject
      // anything that isn't a well-formed trade before touching money/tiles.
      // NaN/undefined cash would slip past every `<` comparison below (all
      // comparisons with NaN are false) and permanently poison a player's cash.
      if (!trade || typeof trade !== "object") {
        throw new Error("Malformed trade offer");
      }
      if (!Number.isInteger(trade.giveCash) || !Number.isInteger(trade.getCash)) {
        throw new Error("Trade cash values must be whole numbers");
      }
      if (!Array.isArray(trade.giveTiles) || !Array.isArray(trade.getTiles)) {
        throw new Error("Trade tile lists must be arrays");
      }
      if (trade.fromId !== playerId) {
        throw new Error("Proposer ID must match active player");
      }

      const proposer = nextState.players.find((p) => p.id === trade.fromId)!;
      const recipient = nextState.players.find((p) => p.id === trade.toId);
      if (!recipient || recipient.bankrupt) {
        throw new Error("Recipient player not found or bankrupt");
      }
      if (recipient.id === proposer.id) {
        throw new Error("Cannot trade with yourself");
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

    case "FORFEIT": {
      // A player permanently left (disconnect/quit). Eliminate them like a
      // bankruptcy to the bank, regardless of cash or whose turn it is, and
      // keep the game in a consistent, playable state.
      const player = nextState.players.find((p) => p.id === playerId);
      // Idempotent / safe no-ops: unknown player, already out, or finished game.
      if (!player || player.bankrupt || nextState.phase === "game-over") {
        break;
      }

      player.bankrupt = true;
      nextState.log.push(`${player.name} left the game and forfeited.`);

      // Ghost votes: this player can no longer be a live voter or a valid target.
      pruneVoteKicks(nextState, playerId);

      // Return all their holdings to the bank (demolish, clear ownership).
      Object.keys(nextState.tiles).forEach((posStr) => {
        const pos = parseInt(posStr, 10);
        if (nextState.tiles[pos].ownerId === playerId) {
          nextState.tiles[pos] = { ownerId: null, houses: 0, mortgaged: false };
        }
      });

      // Write off all debts this player owes (creditors get nothing since
      // assets go to bank) and reroute debts owed TO them to the bank.
      forceWriteOffDebts(nextState, playerId);
      player.cash = Math.max(0, player.cash); // ensure no negative balance

      // Cancel any pending trade they were part of.
      if (
        nextState.activeTrade &&
        (nextState.activeTrade.fromId === playerId || nextState.activeTrade.toId === playerId)
      ) {
        nextState.activeTrade = null;
        nextState.log.push(`A pending trade was cancelled because a player left.`);
      }

      // Pull them out of a live auction; resolve it if no contest remains.
      if (nextState.phase === "auction" && nextState.auctionState) {
        const a = nextState.auctionState;
        a.participantIds = a.participantIds.filter((id) => id !== playerId);
        a.passedIds = a.passedIds.filter((id) => id !== playerId);
        if (a.highestBidderId === playerId) {
          // Their leading bid is void; the tile is open again with no standing bid.
          a.highestBidderId = null;
          a.highestBid = 0;
        }
        a.deadline = null; // server re-arms the clock on the next broadcast
        const stillIn = a.participantIds.filter((id) => !a.passedIds.includes(id));
        const challengers =
          a.highestBidderId !== null ? stillIn.filter((id) => id !== a.highestBidderId) : stillIn;
        if (challengers.length === 0) {
          finalizeAuction(nextState); // also advances turn if the decliner left
        }
      }

      // Win condition: last player standing.
      const remaining = nextState.players.filter((p) => !p.bankrupt);
      if (remaining.length <= 1) {
        nextState.winnerId = remaining.length === 1 ? remaining[0].id : null;
        nextState.phase = "game-over";
        if (remaining.length === 1) {
          nextState.log.push(`${remaining[0].name} has won the game!`);
        }
        evaluateObjectivesAtBoundary(nextState);
        break;
      }

      // If it was their turn (and an auction didn't already hand it off),
      // advance so play doesn't stall waiting on a player who is gone.
      if (
        nextState.phase !== "auction" &&
        nextState.players[nextState.currentPlayerIndex].bankrupt
      ) {
        advanceTurnSkippingBankrupt(nextState);
      }
      break;
    }

    case "DECLARE_BANKRUPT": {
      const bankruptPlayer = nextState.players.find((p) => p.id === playerId)!;
      // Can declare bankruptcy if in debt (negative cash) OR has unsettled debts in the ledger
      const playerDebts = nextState.debtLedger.filter(d => d.debtorId === playerId);
      if (bankruptPlayer.cash >= 0 && playerDebts.length === 0) {
        throw new Error("Cannot declare bankruptcy unless you are in debt (negative cash or unsettled debts)");
      }

      bankruptPlayer.bankrupt = true;

      // Ghost votes: this player can no longer be a live voter or a valid target.
      pruneVoteKicks(nextState, playerId);

      nextState.log.push(`${bankruptPlayer.name} declared bankruptcy!`);

      // Determine primary creditor from the debt ledger for property transfer
      // If debts exist, the first non-bank creditor (if still alive) gets properties.
      // If all creditors are bank or bankrupt, properties go to bank.
      let primaryCreditorId: PlayerId | "bank" = "bank";
      for (const debt of playerDebts) {
        if (debt.creditorId !== "bank") {
          const creditor = nextState.players.find(p => p.id === debt.creditorId);
          if (creditor && !creditor.bankrupt) {
            primaryCreditorId = debt.creditorId;
            break;
          }
        }
      }

      // Force-settle all debts: pay creditors up to available cash, write off shortfalls
      // Transfer cash BEFORE property transfer
      settleDebtsForPlayer(nextState, playerId);

      if (primaryCreditorId === "bank" || primaryCreditorId === "pot") {
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
        if (primaryCreditorId === "bank") {
          nextState.bank += bankruptPlayer.cash;
        } else {
          nextState.freeParkingPot += bankruptPlayer.cash;
        }
        nextState.log.push(`All of ${bankruptPlayer.name}'s properties were returned to the bank.`);
      } else {
        const creditor = nextState.players.find((p) => p.id === primaryCreditorId)!;

        // Transfer remaining properties to creditor
        Object.keys(nextState.tiles).forEach((posStr) => {
          const pos = parseInt(posStr, 10);
          if (nextState.tiles[pos].ownerId === playerId) {
            nextState.tiles[pos].ownerId = primaryCreditorId;
            // Demolish houses
            nextState.tiles[pos].houses = 0;
            // Mortgaged status remains the same
          }
        });

        // Transfer remaining cash if positive (after debt settlement took what it could)
        if (bankruptPlayer.cash > 0) {
          creditor.cash += bankruptPlayer.cash;
          bankruptPlayer.cash = 0;
        }

        nextState.log.push(`All of ${bankruptPlayer.name}'s properties were transferred to ${creditor.name}.`);
      }

      // Ensure bankrupt player's cash is 0 (never negative)
      bankruptPlayer.cash = 0;

      // Reroute any debts owed TO this bankrupt player to the bank
      nextState.debtLedger.forEach(d => {
        if (d.creditorId === playerId) {
          d.creditorId = "bank";
        }
      });

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
      evaluateObjectivesAtBoundary(nextState);
      break;
    }

    case "VOTE_KICK": {
      const targetId = action.targetId;
      const targetPlayer = nextState.players.find(p => p.id === targetId);
      const voterPlayer = nextState.players.find(p => p.id === playerId);
      
      if (!targetPlayer || targetPlayer.bankrupt) {
        throw new Error("Target player is not in the game or is already bankrupt");
      }
      if (!voterPlayer || voterPlayer.bankrupt) {
        throw new Error("You cannot vote if you are not an active player");
      }
      if (targetId === playerId) {
        throw new Error("You cannot vote to commot yourself. Use forfeit instead.");
      }

      if (!nextState.votekicks[targetId]) {
        nextState.votekicks[targetId] = [];
      }
      
      const votes = nextState.votekicks[targetId];
      if (votes.includes(playerId)) {
        throw new Error("You have already voted to commot this player");
      }
      
      votes.push(playerId);
      nextState.log.push(`${voterPlayer.name} voted to commot ${targetPlayer.name} (${votes.length} votes).`);
      
      const activePlayerIds = new Set(nextState.players.filter(p => !p.bankrupt).map(p => p.id));
      const liveVoteCount = votes.filter(id => activePlayerIds.has(id)).length;
      if (liveVoteCount > activePlayerIds.size / 2) {
        targetPlayer.kicked = true;
        nextState.log.push(`Vote majority reached! ${targetPlayer.name} don commot from the game.`);
        // Run the FORFEIT action directly to safely and fully eliminate them (handles auctions/trades/properties)
        return applyAction(nextState, targetId, { type: "FORFEIT" }, rng);
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
    state.bank -= GO_SALARY;
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
      } else if (state.blackout) {
        // NEPA don take light — no light, no rent.
        state.log.push(`⚡ Blackout! ${player.name} landed on ${tile.name} but NEPA don take light — no rent collected.`);
        state.phase = "awaiting-end-turn";
      } else if (state.airportStrike && tile.type === "airport") {
        state.log.push(`✈️ Airport Strike! ${player.name} landed on ${tile.name} but workers don lock gate — no rent collected.`);
        state.phase = "awaiting-end-turn";
      } else {
        let rent = getRent(state, pos, state.dice ? (state.dice[0] + state.dice[1]) : 0);
        if (tile.type === "airport" && rentMultiplier === 2) {
          rent *= 2;
        }

        player.cash -= rent;
        state.stats[player.id].rentPaid += rent;
        if (player.cash < 0) {
          // Insolvent: revert cash deduction, use addDebt to handle properly
          player.cash += rent;
          addDebt(state, player.id, tileState.ownerId!, rent);
        } else {
          // Solvent: immediate transfer (already deducted from player)
          const owner = state.players.find((p) => p.id === tileState.ownerId)!;
          owner.cash += rent;
        }
        const ownerForLog = state.players.find((p) => p.id === tileState.ownerId)!;

        state.log.push(
          `${player.name} paid ₦${rent.toLocaleString("en-NG")} rent to ${ownerForLog.name} for landing on ${tile.name}.`
        );
        state.phase = "awaiting-end-turn";
      }
    }
  } else if (tile.type === "tax") {
    if (state.settings.freeParkingJackpot) {
      addDebt(state, player.id, "pot", tile.amount);
      state.log.push(`${player.name} paid ₦${tile.amount.toLocaleString("en-NG")} for ${tile.name} (added to Mama Put Pot).`);
    } else {
      addDebt(state, player.id, "bank", tile.amount);
      state.log.push(`${player.name} paid ₦${tile.amount.toLocaleString("en-NG")} for ${tile.name}.`);
    }
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "jail") {
    state.log.push(`${player.name} is just visiting Kirikiri Prison.`);
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "free") {
    if (state.settings.freeParkingJackpot && state.freeParkingPot > 0) {
      player.cash += state.freeParkingPot;
      state.log.push(`${player.name} landed on Mama Put Rest Stop (Free Parking) and collected the Mama Put Pot of ₦${state.freeParkingPot.toLocaleString("en-NG")}!`);
      state.freeParkingPot = 0;
    } else {
      state.log.push(`${player.name} landed on Mama Put Rest Stop (Free Parking).`);
    }
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "gotojail") {
    player.inJail = true;
    player.jailTurns = 0;
    player.position = JAIL_POSITION;
    state.doublesCount = 0;
    state.stats[player.id].jailTimes += 1;
    state.log.push(`${player.name} was sent to Kirikiri Prison!`);
    state.phase = "awaiting-end-turn";
  } else if (tile.type === "chance" || tile.type === "hustle") {
    drawCard(state, player, tile.type, rng);
  } else if (tile.type === "go") {
    state.log.push(`${player.name} landed on START.`);
    state.phase = "awaiting-end-turn";
  }
}

function drawCard(
  state: GameState,
  player: Player,
  type: "chance" | "hustle",
  rng: () => number,
): void {
  const isChance = type === "chance";
  const order = isChance ? state.chanceOrder : state.hustleOrder;
  const ptr = isChance ? state.chancePtr : state.hustlePtr;
  // ALL_CHANCE_CARDS so chaos-mode card ids resolve too (they're only in the
  // shuffled order when chaos mode is on, but must always be findable by id).
  const deck = isChance ? ALL_CHANCE_CARDS : HUSTLE_CARDS;

  if (order.length === 0) {
    throw new Error(`The ${type} deck is empty`);
  }

  const cardId = order[ptr];
  const card = deck.find((c) => c.id === cardId);
  if (!card) {
    throw new Error(`Card not found in deck: ${cardId}`);
  }

  state.log.push(`${player.name} drew ${isChance ? "Chance" : "Hustle"}: "${card.text}"`);

  // Manage pointer and deck arrays
  let nextPtr = ptr;
  if (card.action.kind === "getOutOfJailFree") {
    const nextOrder = order.filter((id) => id !== cardId);
    if (isChance) {
      state.chanceOrder = nextOrder;
    } else {
      state.hustleOrder = nextOrder;
    }
    nextPtr = nextOrder.length > 0 ? ptr % nextOrder.length : 0;
  } else {
    nextPtr = (ptr + 1) % order.length;
  }

  if (isChance) {
    state.chancePtr = nextPtr;
  } else {
    state.hustlePtr = nextPtr;
  }

  applyCardAction(state, player, card.action, type, rng);
}

function applyCardAction(
  state: GameState,
  player: Player,
  action: typeof CHANCE_CARDS[0]["action"],
  deckSource: "chance" | "hustle",
  rng: () => number,
): void {
  switch (action.kind) {
    case "money": {
      if (action.amount < 0) {
        const amtAbs = Math.abs(action.amount);
        if (state.settings.freeParkingJackpot) {
          addDebt(state, player.id, "pot", amtAbs);
          state.log.push(`${player.name} lost ₦${amtAbs.toLocaleString("en-NG")} (added to Mama Put Pot).`);
        } else {
          addDebt(state, player.id, "bank", amtAbs);
          state.log.push(`${player.name} lost ₦${amtAbs.toLocaleString("en-NG")}.`);
        }
      } else {
        player.cash += action.amount;
        state.bank -= action.amount;
        state.log.push(`${player.name} received ₦${action.amount.toLocaleString("en-NG")}.`);
      }
      state.phase = "awaiting-end-turn";
      break;
    }

    case "moveTo": {
      const currentPos = player.position;
      const targetPos = action.pos;
      if (action.collectIfPass && targetPos < currentPos) {
        player.cash += GO_SALARY;
        state.bank -= GO_SALARY;
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
      state.stats[player.id].jailTimes += 1;
      state.log.push(`${player.name} was sent to Kirikiri Prison!`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "getOutOfJailFree": {
      player.jailCardSources.push(deckSource);
      state.log.push(`${player.name} received a Get Out of Jail Free card.`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "collectFromEach": {
      // Each non-bankrupt opponent pays the card holder. Non-current players
      // who can't afford it pay what they can (shortfall written off).
      let totalCollected = 0;
      state.players.forEach((p) => {
        if (p.id !== player.id && !p.bankrupt) {
          // Use addDebt which handles solvent (immediate) vs insolvent (capped)
          // For non-current players, addDebt auto-settles inline.
          const beforeCash = player.cash;
          addDebt(state, p.id, player.id, action.amount);
          // Track how much was actually received by the collector
          totalCollected += player.cash - beforeCash;
          state.log.push(`${p.name} paid ₦${action.amount.toLocaleString("en-NG")} to ${player.name}.`);
        }
      });
      state.phase = "awaiting-end-turn";
      break;
    }

    case "payEach": {
      // Current player pays each non-bankrupt opponent.
      // Each payment is a separate debt — uses addDebt per recipient.
      state.players.forEach((p) => {
        if (p.id !== player.id && !p.bankrupt) {
          addDebt(state, player.id, p.id, action.amount);
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
      if (state.settings.freeParkingJackpot) {
        addDebt(state, player.id, "pot", totalCost);
        state.log.push(
          `${player.name} paid ₦${totalCost.toLocaleString("en-NG")} for property repairs (${housesCount} Bungalow/Duplex/Mansion/Estate(s), ${hotelsCount} Hotel(s)) (added to Mama Put Pot).`
        );
      } else {
        addDebt(state, player.id, "bank", totalCost);
        state.log.push(
          `${player.name} paid ₦${totalCost.toLocaleString("en-NG")} for property repairs (${housesCount} Bungalow/Duplex/Mansion/Estate(s), ${hotelsCount} Hotel(s)).`
        );
      }
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
        state.bank -= GO_SALARY;
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
        state.bank -= GO_SALARY;
        state.log.push(`${player.name} passed START and collected ₦200,000.`);
      }

      player.position = targetPos;
      state.log.push(`${player.name} moved to nearest Utility: ${BOARD[targetPos].name}.`);

      const tileState = state.tiles[targetPos];
      if (state.blackout && tileState.ownerId !== null && tileState.ownerId !== player.id && !tileState.mortgaged) {
        // NEPA blackout — utility owner can't charge either.
        state.log.push(`⚡ Blackout! ${player.name} reached ${BOARD[targetPos].name} but NEPA don take light — no rent collected.`);
        state.phase = "awaiting-end-turn";
      } else if (tileState.ownerId !== null && tileState.ownerId !== player.id && !tileState.mortgaged) {
        // Roll dice and pay 10x roll
        const rd1 = Math.floor(rng() * 6) + 1;
        const rd2 = Math.floor(rng() * 6) + 1;
        const diceTotal = rd1 + rd2;
        const rent = diceTotal * 10;

        const owner = state.players.find((p) => p.id === tileState.ownerId)!;
        player.cash -= rent;
        if (player.cash < 0) {
          // Insolvent: revert and use addDebt
          player.cash += rent;
          addDebt(state, player.id, owner.id, rent);
        } else {
          // Solvent: immediate transfer
          owner.cash += rent;
        }

        state.log.push(
          `${player.name} rolled [${rd1}, ${rd2}] for utility rent. Paid ₦${rent.toLocaleString("en-NG")} to ${owner.name}.`
        );
        state.phase = "awaiting-end-turn";
      } else {
        resolveLanding(state, player, targetPos, 1, rng);
      }
      break;
    }

    case "blackout": {
      // NEPA takes light: rent is waived until the round wraps back around
      // (currentTurn increments once). Drawing again while already dark just
      // refreshes the window.
      state.blackout = { untilRound: state.currentTurn + 1 };
      state.log.push(`⚡ NEPA don take light! Total blackout — no rent until the round waka back around.`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "airportStrike": {
      state.airportStrike = { untilRound: state.currentTurn + 1 };
      state.log.push(`✈️ Airport Strike! Aviation workers don lock gate — no airport rent until the round waka back around.`);
      state.phase = "awaiting-end-turn";
      break;
    }

    case "propertyBonus": {
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

      const bonus = housesCount * action.perHouse + hotelsCount * action.perHotel;
      player.cash += bonus;
      state.bank -= bonus;
      
      if (bonus > 0) {
        state.log.push(`📈 Market Boom! ${player.name} collected ₦${bonus.toLocaleString("en-NG")} for owning ${housesCount} house(s) and ${hotelsCount} hotel(s).`);
      } else {
        state.log.push(`📈 Market Boom! ${player.name} collected nothing (no developed properties).`);
      }
      
      state.phase = "awaiting-end-turn";
      break;
    }

    default:
      throw new Error(`Card action kind is not implemented yet`);
  }
}
