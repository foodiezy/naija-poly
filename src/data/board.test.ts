import { describe, it, expect } from "vitest";
import {
  BOARD,
  CHANCE_CARDS,
  HUSTLE_CARDS,
  AIRPORT_COUNT,
  UTILITY_COUNT,
  type PropertyTile,
} from "./board";

describe("Nigerian board data", () => {
  it("has 40 tiles", () => {
    expect(BOARD).toHaveLength(40);
  });

  it("positions are 0..39 in order with no gaps", () => {
    BOARD.forEach((tile, i) => expect(tile.pos).toBe(i));
  });

  it("has 22 properties, 4 airports, 2 utilities", () => {
    const props = BOARD.filter((t) => t.type === "property");
    expect(props).toHaveLength(22);
    expect(AIRPORT_COUNT).toBe(4);
    expect(UTILITY_COUNT).toBe(2);
  });

  it("every property has a 6-entry rent table and positive price", () => {
    BOARD.filter((t): t is PropertyTile => t.type === "property").forEach((p) => {
      expect(p.rent).toHaveLength(6);
      expect(p.price).toBeGreaterThan(0);
      // rent should be monotonically non-decreasing as you build
      for (let i = 1; i < p.rent.length; i++) {
        expect(p.rent[i]).toBeGreaterThan(p.rent[i - 1]);
      }
    });
  });

  it("has full 16-card decks with unique ids", () => {
    expect(CHANCE_CARDS).toHaveLength(16);
    expect(HUSTLE_CARDS).toHaveLength(16);
    const ids = [...CHANCE_CARDS, ...HUSTLE_CARDS].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
