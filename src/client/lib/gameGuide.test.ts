import { describe, expect, it } from "vitest";
import { GAME_GUIDE, hasSeenGameGuide, markGameGuideSeen } from "./gameGuide";

describe("GAME_GUIDE", () => {
  it("covers every decision a first-time player needs to finish a game", () => {
    expect(GAME_GUIDE.map((topic) => topic.id)).toEqual([
      "token",
      "turn",
      "property",
      "build",
      "trade",
      "debt",
      "special",
      "win",
    ]);
  });

  it("has unique, usable copy for every topic", () => {
    expect(new Set(GAME_GUIDE.map((topic) => topic.title)).size).toBe(GAME_GUIDE.length);
    for (const topic of GAME_GUIDE) {
      expect(topic.emoji.length).toBeGreaterThan(0);
      expect(topic.title.length).toBeGreaterThan(5);
      expect(topic.desc.length).toBeGreaterThan(30);
    }
  });
});

describe("guide completion", () => {
  it("remembers when a player has completed the guide", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(hasSeenGameGuide(storage)).toBe(false);
    markGameGuideSeen(storage);
    expect(hasSeenGameGuide(storage)).toBe(true);
  });

  it("fails safely when browser storage is unavailable", () => {
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(hasSeenGameGuide(blockedStorage)).toBe(false);
    expect(() => markGameGuideSeen(blockedStorage)).not.toThrow();
  });
});
