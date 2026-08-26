import { describe, it, expect } from "vitest";
import { primaryAction, nairaShort, naira, type PrimaryCtx } from "./primaryAction";
import type { Player } from "../../engine/types";

function player(over: Partial<Player> = {}): Player {
  return {
    id: "me",
    name: "Chidi",
    cash: 1_500_000,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCardSources: [],
    bankrupt: false,
    order: 0,
    ...over,
  };
}

function ctx(over: Partial<PrimaryCtx> = {}): PrimaryCtx {
  return {
    phase: "awaiting-roll",
    isMyTurn: true,
    me: player(),
    activePlayerName: "Chidi",
    tokenWalking: false,
    debt: 0,
    chaosPending: false,
    landedPrice: null,
    landedName: null,
    ...over,
  };
}

describe("nairaShort", () => {
  it("abbreviates millions to one decimal", () => {
    expect(nairaShort(1_240_000)).toBe("₦1.2M");
    expect(nairaShort(2_000_000)).toBe("₦2M");
  });
  it("abbreviates thousands", () => {
    expect(nairaShort(120_000)).toBe("₦120k");
  });
  it("leaves small amounts alone", () => {
    expect(nairaShort(400)).toBe("₦400");
  });
});

describe("naira", () => {
  it("groups thousands", () => {
    expect(naira(1_240_000)).toBe("₦1,240,000");
  });
});

describe("primaryAction precedence", () => {
  it("game over beats everything", () => {
    expect(primaryAction(ctx({ phase: "game-over", debt: 500 })).kind).toBe("results");
  });

  it("bankrupt players spectate", () => {
    const a = primaryAction(ctx({ me: player({ bankrupt: true }) }));
    expect(a.kind).toBe("spectating");
    expect(a.disabled).toBe(true);
  });

  it("vote-kicked players spectate too", () => {
    expect(primaryAction(ctx({ me: player({ kicked: true }) })).kind).toBe("spectating");
  });

  it("debt outranks the turn action", () => {
    const a = primaryAction(ctx({ phase: "awaiting-roll", debt: 80_000 }));
    expect(a.kind).toBe("settle-debt");
    expect(a.tone).toBe("danger");
    expect(a.label).toContain("₦80k");
  });

  it("a running auction disables the bar", () => {
    const a = primaryAction(ctx({ phase: "auction" }));
    expect(a.kind).toBe("hold");
    expect(a.disabled).toBe(true);
  });

  it("a chaos decision aimed at me disables the bar", () => {
    const a = primaryAction(ctx({ chaosPending: true }));
    expect(a.kind).toBe("hold");
    expect(a.disabled).toBe(true);
  });

  it("chaos phases aimed at someone else still hold the bar", () => {
    const a = primaryAction(ctx({ phase: "awaiting-efcc-choice", isMyTurn: false }));
    expect(a.kind).toBe("hold");
  });
});

describe("primaryAction off-turn", () => {
  it("names whoever is playing", () => {
    const a = primaryAction(ctx({ isMyTurn: false, activePlayerName: "Ada" }));
    expect(a.kind).toBe("waiting");
    expect(a.disabled).toBe(true);
    expect(a.label).toBe("Ada dey play…");
  });

  it("falls back gracefully with no active name", () => {
    expect(primaryAction(ctx({ isMyTurn: false, activePlayerName: "" })).label).toContain(
      "Somebody",
    );
  });
});

describe("primaryAction on-turn", () => {
  it("offers a roll", () => {
    expect(primaryAction(ctx()).kind).toBe("roll");
  });

  it("names the jail escape", () => {
    expect(primaryAction(ctx({ me: player({ inJail: true }) })).label).toContain("jail");
  });

  it("holds the action bar while a roll is still being presented", () => {
    const a = primaryAction(ctx({ tokenWalking: true }));
    expect(a.kind).toBe("hold");
    expect(a.label).toContain("roll");
    expect(a.disabled).toBe(true);
  });

  it("offers a buy when the tile is affordable", () => {
    const a = primaryAction(
      ctx({ phase: "awaiting-buy-decision", landedPrice: 120_000, landedName: "Ilorin" }),
    );
    expect(a.kind).toBe("buy");
    expect(a.label).toBe("Buy Ilorin · ₦120k");
  });

  it("falls back to auction when the tile is out of reach", () => {
    const a = primaryAction(
      ctx({
        phase: "awaiting-buy-decision",
        landedPrice: 120_000,
        landedName: "Ilorin",
        me: player({ cash: 40_000 }),
      }),
    );
    expect(a.kind).toBe("auction");
  });

  it("waits for the token to finish walking before offering a buy", () => {
    const a = primaryAction(
      ctx({ phase: "awaiting-buy-decision", landedPrice: 120_000, tokenWalking: true }),
    );
    expect(a.kind).toBe("hold");
    expect(a.disabled).toBe(true);
  });

  it("offers end turn", () => {
    expect(primaryAction(ctx({ phase: "awaiting-end-turn" })).kind).toBe("end-turn");
  });

  it("holds during transient resolution", () => {
    const a = primaryAction(ctx({ phase: "resolving" }));
    expect(a.kind).toBe("hold");
    expect(a.disabled).toBe(true);
  });
});
