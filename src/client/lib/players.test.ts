import { describe, it, expect } from "vitest";
import { countHumans } from "./players";

describe("countHumans", () => {
  it("is zero for an empty list", () => {
    expect(countHumans([])).toBe(0);
  });

  it("counts every id when all are humans", () => {
    expect(countHumans(["p1", "p2", "p3"])).toBe(3);
  });

  it("excludes ai_-prefixed ids from a mixed list", () => {
    expect(countHumans(["p1", "ai_1", "p2", "ai_2"])).toBe(2);
  });

  it("is zero when every id is a bot", () => {
    expect(countHumans(["ai_1", "ai_2"])).toBe(0);
  });
});
