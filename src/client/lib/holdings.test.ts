import { describe, it, expect } from "vitest";
import { TileState } from "../../engine/types";
import { tileValue, ownedTiles, netWorth, ownsFullGroup, developmentPips } from "./holdings";

// Board fixtures: the "brown" group is pos 1 (Maiduguri) and pos 3 (Bama),
// each price 60_000, houseCost 50_000, mortgage 30_000. Pos 2 is a Hustle card
// tile (unownable, no price).
const own = (overrides: Partial<TileState> = {}): TileState => ({
  ownerId: "p1",
  houses: 0,
  mortgaged: false,
  ...overrides,
});

describe("tileValue", () => {
  it("is the purchase price for an undeveloped owned property", () => {
    expect(tileValue(1, { 1: own() })).toBe(60_000);
  });

  it("is the mortgage value when mortgaged", () => {
    expect(tileValue(1, { 1: own({ mortgaged: true }) })).toBe(30_000);
  });

  it("adds house cost per house on top of price", () => {
    expect(tileValue(1, { 1: own({ houses: 2 }) })).toBe(60_000 + 2 * 50_000);
  });

  it("is zero for a non-ownable tile", () => {
    expect(tileValue(2, {})).toBe(0);
  });
});

describe("ownedTiles & netWorth", () => {
  const tiles: Record<number, TileState> = {
    1: own(),
    3: own({ mortgaged: true }),
  };

  it("lists only the player's tiles", () => {
    expect(ownedTiles(tiles, "p1").map((t) => t.pos).sort()).toEqual([1, 3]);
    expect(ownedTiles(tiles, "p2")).toHaveLength(0);
  });

  it("sums cash plus tile values (mortgaged at mortgage value)", () => {
    // 100_000 cash + 60_000 (pos1) + 30_000 (pos3 mortgaged) = 190_000
    expect(netWorth(100_000, tiles, "p1")).toBe(190_000);
  });
});

describe("ownsFullGroup", () => {
  it("is true only when every tile in the color group is owned", () => {
    expect(ownsFullGroup(1, { 1: own(), 3: own() }, "p1")).toBe(true);
    expect(ownsFullGroup(1, { 1: own() }, "p1")).toBe(false);
    expect(ownsFullGroup(1, { 1: own(), 3: own({ ownerId: "p2" }) }, "p1")).toBe(false);
  });

  it("is false for non-property tiles", () => {
    expect(ownsFullGroup(2, {}, "p1")).toBe(false);
  });
});

describe("developmentPips", () => {
  it("renders one house per level and a hotel at level 5", () => {
    expect(developmentPips(1, { 1: own({ houses: 0 }) })).toBe("");
    expect(developmentPips(1, { 1: own({ houses: 3 }) })).toBe("🏠🏠🏠");
    expect(developmentPips(1, { 1: own({ houses: 5 }) })).toBe("🏨");
  });
});
