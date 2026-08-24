import { describe, expect, it } from "vitest";
import { configuredOrigins, isOriginAllowed } from "./originPolicy";

describe("configuredOrigins", () => {
  it("normalizes, de-duplicates, and combines configured and service origins", () => {
    expect(
      configuredOrigins(
        "https://play.example.com/, https://staging.example.com, https://play.example.com",
        "https://odogwu.example.com/",
      ),
    ).toEqual([
      "https://play.example.com",
      "https://staging.example.com",
      "https://odogwu.example.com",
    ]);
  });

  it("ignores malformed values and URLs that are not exact origins", () => {
    expect(
      configuredOrigins(
        "not-a-url, ftp://example.com, https://example.com/path, https://example.com?x=1",
      ),
    ).toEqual([]);
  });
});

describe("isOriginAllowed", () => {
  const allowedOrigins = ["https://play.example.com"];

  it("allows requests without a browser Origin header", () => {
    expect(isOriginAllowed(undefined, { allowedOrigins, isProduction: true })).toBe(true);
  });

  it("allows an exact configured production origin", () => {
    expect(
      isOriginAllowed("https://play.example.com", { allowedOrigins, isProduction: true }),
    ).toBe(true);
  });

  it("rejects lookalike and untrusted production origins", () => {
    expect(
      isOriginAllowed("https://play.example.com.evil.test", {
        allowedOrigins,
        isProduction: true,
      }),
    ).toBe(false);
    expect(
      isOriginAllowed("https://other.onrender.com", { allowedOrigins, isProduction: true }),
    ).toBe(false);
  });

  it("allows local HTTP development origins outside production", () => {
    expect(isOriginAllowed("http://localhost:5173", { allowedOrigins, isProduction: false })).toBe(
      true,
    );
    expect(isOriginAllowed("http://127.0.0.1:5173", { allowedOrigins, isProduction: false })).toBe(
      true,
    );
  });

  it("rejects local origins in production", () => {
    expect(isOriginAllowed("http://localhost:5173", { allowedOrigins, isProduction: true })).toBe(
      false,
    );
  });

  it("rejects malformed origin headers", () => {
    expect(
      isOriginAllowed("https://play.example.com/path", {
        allowedOrigins,
        isProduction: true,
      }),
    ).toBe(false);
  });
});
