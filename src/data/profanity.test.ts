import { describe, it, expect } from "vitest";
import { censorProfanity, sanitisePlayerName } from "./profanity";

describe("censorProfanity", () => {
  it("censors a curse word to asterisks of the same length", () => {
    expect(censorProfanity("you are shit")).toBe("you are ****");
  });

  it("is case-insensitive", () => {
    expect(censorProfanity("SHIT and Bitch")).toBe("**** and *****");
  });

  it("catches leetspeak and symbol substitutions", () => {
    expect(censorProfanity("sh1t and $hit")).toBe("**** and ****");
  });

  it("censors curated inflections", () => {
    expect(censorProfanity("bitches")).toBe("*******");
    expect(censorProfanity("fucking")).toBe("*******");
  });

  it("only blanks the offending word, preserving the rest", () => {
    expect(censorProfanity("this game is crap honestly")).toBe("this game is **** honestly");
  });

  it("does NOT censor innocent words that merely contain a bad substring", () => {
    // Scunthorpe guard: class/assist/grass contain "ass"; Dickson contains "dick".
    const clean = "class assist grass Dickson assassin";
    expect(censorProfanity(clean)).toBe(clean);
  });

  it("returns clean text unchanged", () => {
    expect(censorProfanity("good game everyone, buy Ikoyi!")).toBe(
      "good game everyone, buy Ikoyi!",
    );
  });
});

describe("sanitisePlayerName", () => {
  it("trims names and keeps clean names unchanged", () => {
    expect(sanitisePlayerName("  Ada Lovelace  ")).toBe("Ada Lovelace");
  });

  it("censors profanity and leetspeak before a name enters room state", () => {
    expect(sanitisePlayerName("Sh1t King")).toBe("**** King");
  });

  it("uses the existing fallback for blank or invalid names", () => {
    expect(sanitisePlayerName("   ")).toBe("Player");
    expect(sanitisePlayerName(undefined)).toBe("Player");
  });

  it("limits names to 20 complete characters without splitting emoji", () => {
    const result = sanitisePlayerName(`🎲${"a".repeat(25)}`);
    expect(Array.from(result)).toHaveLength(20);
    expect(result.startsWith("🎲")).toBe(true);
  });
});
