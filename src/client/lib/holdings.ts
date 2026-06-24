// Pure helpers behind the Assets panel: ownership, valuation, and development
// readouts. Kept out of the component so they can be unit-tested without a DOM.
import { BOARD, PropertyTile, Tile } from "../../data/board";
import { TileState } from "../../engine/types";

type Tiles = Record<number, TileState>;

// The bank value of a single board position for net-worth purposes: mortgage
// value if mortgaged, otherwise price plus any houses/hotel at cost.
export function tileValue(pos: number, tiles: Tiles): number {
  const tile = BOARD[pos];
  if (!tile || !("price" in tile)) return 0;
  const ts = tiles[pos];
  if (ts?.mortgaged) return tile.mortgage;
  let v = tile.price;
  if (tile.type === "property" && ts && ts.houses > 0) v += ts.houses * (tile as PropertyTile).houseCost;
  return v;
}

// All board tiles currently owned by a player.
export function ownedTiles(tiles: Tiles, playerId: string): Tile[] {
  return BOARD.filter((t) => tiles[t.pos]?.ownerId === playerId);
}

// A player's net worth: cash plus the bank value of every tile they own.
export function netWorth(cash: number, tiles: Tiles, playerId: string): number {
  return ownedTiles(tiles, playerId).reduce((sum, t) => sum + tileValue(t.pos, tiles), cash);
}

// True when the player owns every property in this tile's color group.
export function ownsFullGroup(pos: number, tiles: Tiles, playerId: string): boolean {
  const tile = BOARD[pos];
  if (!tile || tile.type !== "property") return false;
  const group = tile.group;
  const groupTiles = BOARD.filter((t): t is PropertyTile => t.type === "property" && t.group === group);
  return groupTiles.every((t) => tiles[t.pos]?.ownerId === playerId);
}

// Visual development readout: one house emoji per level, or a hotel at level 5+.
export function developmentPips(pos: number, tiles: Tiles): string {
  const tile = BOARD[pos];
  const ts = tiles[pos];
  if (!tile || tile.type !== "property" || !ts || ts.houses <= 0) return "";
  return ts.houses >= 5 ? "🏨" : "🏠".repeat(ts.houses);
}
