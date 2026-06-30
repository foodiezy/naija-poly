// engine/queries.ts — pure, read-only predicates over GameState.
// Single source of truth for what property actions are legal; imported by
// both the client (to enable/disable buttons) and the engine (to validate).

import { BOARD, HOUSE_SUPPLY, HOTEL_SUPPLY } from "../data/board";
import type { PropertyTile } from "../data/board";
import type { GameState, PlayerId } from "./types";

export function canBuildOn(state: GameState, playerId: PlayerId, pos: number): boolean {
  const tile = BOARD[pos];
  if (!tile || tile.type !== "property") return false;
  const ts = state.tiles[pos];
  if (!ts || ts.ownerId !== playerId || ts.mortgaged || ts.houses >= 5) return false;

  const group = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === tile.group);
  if (!group.every((t) => state.tiles[t.pos]?.ownerId === playerId)) return false;
  if (group.some((t) => state.tiles[t.pos]?.mortgaged)) return false;
  if (group.some((t) => (state.tiles[t.pos]?.houses ?? 0) < ts.houses)) return false;

  const me = state.players.find((p) => p.id === playerId);
  if (!me || me.cash < tile.houseCost) return false;

  let totalHouses = 0;
  let totalHotels = 0;
  Object.values(state.tiles).forEach((s) => {
    if (s.houses === 5) totalHotels++;
    else if (s.houses >= 1) totalHouses += s.houses;
  });
  return ts.houses === 4 ? totalHotels < HOTEL_SUPPLY : totalHouses < HOUSE_SUPPLY;
}

export function canSellHouseOn(state: GameState, playerId: PlayerId, pos: number): boolean {
  const tile = BOARD[pos];
  if (!tile || tile.type !== "property") return false;
  const ts = state.tiles[pos];
  if (!ts || ts.ownerId !== playerId || ts.houses === 0) return false;

  const group = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === tile.group);
  return !group.some((t) => (state.tiles[t.pos]?.houses ?? 0) > ts.houses);
}

export function canMortgageAt(state: GameState, playerId: PlayerId, pos: number): boolean {
  const tile = BOARD[pos];
  if (!tile || !("mortgage" in tile)) return false;
  const ts = state.tiles[pos];
  if (!ts || ts.ownerId !== playerId || ts.mortgaged) return false;

  if (tile.type === "property") {
    const group = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === tile.group);
    if (group.some((t) => (state.tiles[t.pos]?.houses ?? 0) > 0)) return false;
  }
  return true;
}

export function canUnmortgageAt(state: GameState, playerId: PlayerId, pos: number): boolean {
  const tile = BOARD[pos];
  if (!tile || !("mortgage" in tile)) return false;
  const ts = state.tiles[pos];
  if (!ts || ts.ownerId !== playerId || !ts.mortgaged) return false;

  const me = state.players.find((p) => p.id === playerId);
  return !!me && me.cash >= Math.round(tile.mortgage * 1.1);
}
