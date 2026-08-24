import type { GameState, Player, TradeOffer } from "../../engine/types";

export interface PlayerInteractionState {
  player: Player | undefined;
  ledgerDebt: number;
  inDebt: boolean;
  incomingTrade: TradeOffer | null;
  canProposeTrade: boolean;
}

/**
 * Derive the UI gates shared by the action bar and game-level decision sheets.
 * Keeping this pure makes mobile reachability rules testable without a browser.
 */
export function playerInteractionState(
  state: GameState | null | undefined,
  playerId: string | null | undefined,
): PlayerInteractionState {
  const player = state?.players.find((candidate) => candidate.id === playerId);
  const ledgerDebt =
    state?.debtLedger
      .filter((debt) => debt.debtorId === playerId)
      .reduce((total, debt) => total + debt.amount, 0) ?? 0;
  const eligible = !!player && !player.bankrupt && !player.kicked;

  return {
    player,
    ledgerDebt,
    inDebt: eligible && (player.cash < 0 || ledgerDebt > 0),
    incomingTrade:
      state?.activeTrade && state.activeTrade.toId === playerId ? state.activeTrade : null,
    canProposeTrade:
      eligible &&
      !!state &&
      state.players.length >= 2 &&
      !state.activeTrade &&
      state.phase !== "auction" &&
      state.phase !== "game-over",
  };
}

/** Reverse an incoming offer from the recipient's point of view. */
export function counterOfferFrom(incoming: TradeOffer, recipientId: string): TradeOffer {
  if (incoming.toId !== recipientId) {
    throw new Error("Only the trade recipient can build a counter-offer");
  }

  return {
    fromId: recipientId,
    toId: incoming.fromId,
    giveCash: incoming.getCash,
    getCash: incoming.giveCash,
    giveTiles: [...incoming.getTiles],
    getTiles: [...incoming.giveTiles],
    giveJailCards: incoming.getJailCards ?? 0,
    getJailCards: incoming.giveJailCards ?? 0,
  };
}
