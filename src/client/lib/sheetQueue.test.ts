import { describe, it, expect } from "vitest";
import { pickDecision, waitingLabel, DECISION_PRIORITY, type DecisionKind } from "./sheetQueue";

describe("pickDecision", () => {
  it("returns nothing when no decision is active", () => {
    expect(pickDecision([])).toEqual({ visible: null, waiting: 0 });
  });

  it("shows a lone decision with nothing waiting", () => {
    expect(pickDecision(["buy-deed"])).toEqual({ visible: "buy-deed", waiting: 0 });
  });

  it("prefers debt rescue over everything else", () => {
    const all = [...DECISION_PRIORITY].reverse();
    expect(pickDecision(all)).toEqual({ visible: "debt-rescue", waiting: 4 });
  });

  it("orders auction above chaos, chaos above trade, trade above buy", () => {
    expect(pickDecision(["chaos", "auction"]).visible).toBe("auction");
    expect(pickDecision(["trade-incoming", "chaos"]).visible).toBe("chaos");
    expect(pickDecision(["buy-deed", "trade-incoming"]).visible).toBe("trade-incoming");
  });

  it("counts waiting sheets, not registrations", () => {
    expect(pickDecision(["auction", "auction", "buy-deed"])).toEqual({
      visible: "auction",
      waiting: 1,
    });
  });

  it("ignores unknown kinds instead of blanking the screen", () => {
    expect(pickDecision(["nope" as DecisionKind, "buy-deed"])).toEqual({
      visible: "buy-deed",
      waiting: 0,
    });
  });

  it("is order-independent", () => {
    expect(pickDecision(["buy-deed", "auction"])).toEqual(pickDecision(["auction", "buy-deed"]));
  });
});

describe("waitingLabel", () => {
  it("is empty when nothing waits", () => {
    expect(waitingLabel(0)).toBe("");
  });

  it("reads '1 waiting'", () => {
    expect(waitingLabel(1)).toBe("1 waiting");
    expect(waitingLabel(3)).toBe("3 waiting");
  });
});
