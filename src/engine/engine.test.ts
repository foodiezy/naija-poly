import { describe, it, expect } from "vitest";
import { createGame, applyAction } from "./engine";
import { STARTING_CASH, GO_SALARY, JAIL_FINE, BOARD, type PropertyTile } from "../data/board";

// Helper stateful RNG mock
class MockRNG {
  private values: number[];
  private index: number = 0;

  constructor(values: number[]) {
    this.values = values;
  }

  // Returns a mock value that produces the desired dice roll.
  // Since we do Math.floor(rng() * 6) + 1, we can calculate rng value:
  // (desired - 1) / 6 <= rng() < desired / 6
  // We can just return (desired - 0.5) / 6.
  static makeRoll(d1: number, d2: number): MockRNG {
    return new MockRNG([(d1 - 0.5) / 6, (d2 - 0.5) / 6]);
  }

  static makeSequence(rolls: [number, number][]): MockRNG {
    const vals: number[] = [];
    for (const [d1, d2] of rolls) {
      vals.push((d1 - 0.5) / 6, (d2 - 0.5) / 6);
    }
    return new MockRNG(vals);
  }

  getRNG(): () => number {
    return () => {
      if (this.index >= this.values.length) {
        return 0.5; // fallback
      }
      return this.values[this.index++];
    };
  }
}

describe("Game Engine", () => {
  describe("createGame", () => {
    it("initializes game state correctly", () => {
      const state = createGame(["p1", "p2"]);
      expect(state.players).toHaveLength(2);
      expect(state.players[0].id).toBe("p1");
      expect(state.players[0].cash).toBe(STARTING_CASH);
      expect(state.players[0].position).toBe(0);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe("awaiting-roll");
      expect(state.dice).toBeNull();
      expect(state.doublesCount).toBe(0);
      expect(state.chanceOrder).toHaveLength(16);
      expect(state.hustleOrder).toHaveLength(16);
      expect(state.chancePtr).toBe(0);
      expect(state.hustlePtr).toBe(0);
      expect(state.log[0]).toBe("The game has started!");
    });

    it("throws when too few players", () => {
      expect(() => createGame(["p1"])).toThrow();
    });
  });

  describe("ROLL action", () => {
    it("moves player and transitions to buy decision on unowned property", () => {
      const state = createGame(["p1", "p2"]);
      const mockRng = MockRNG.makeRoll(1, 2); // rolls a 3, landing on Mushin (pos 3)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].position).toBe(3);
      expect(nextState.phase).toBe("awaiting-buy-decision");
      expect(nextState.dice).toEqual([1, 2]);
    });

    it("moves player past START and awards salary", () => {
      const state = createGame(["p1", "p2"]);
      // Move to pos 38 (Customs Duty)
      state.players[0].position = 38;

      const mockRng = MockRNG.makeRoll(2, 3); // rolls a 5 -> lands on pos 3 (Mushin)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].position).toBe(3);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + GO_SALARY);
      expect(nextState.phase).toBe("awaiting-buy-decision");
    });

    it("allows doubles to grant another turn on next ROLL", () => {
      const state = createGame(["p1", "p2"]);
      const mockRng = MockRNG.makeRoll(2, 2); // rolls 4 -> lands on FIRS Income Tax (pos 4)
      let nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      // Landed on Tax: paid 200k immediately
      expect(nextState.players[0].position).toBe(4);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 200_000);
      expect(nextState.phase).toBe("awaiting-end-turn");
      expect(nextState.doublesCount).toBe(1);

      // End turn keeps p1's turn
      nextState = applyAction(nextState, "p1", { type: "END_TURN" });
      expect(nextState.currentPlayerIndex).toBe(0);
      expect(nextState.phase).toBe("awaiting-roll");
    });

    it("sends player to jail on third consecutive doubles", () => {
      const state = createGame(["p1", "p2"]);
      state.doublesCount = 2; // already rolled 2 doubles

      const mockRng = MockRNG.makeRoll(3, 3); // 3rd doubles
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].inJail).toBe(true);
      expect(nextState.players[0].position).toBe(10); // Jail position
      expect(nextState.doublesCount).toBe(0);
      expect(nextState.phase).toBe("awaiting-end-turn");
    });
  });

  describe("Jail mechanics", () => {
    it("releases player from jail immediately if they roll doubles", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].inJail = true;
      state.players[0].position = 10;

      const mockRng = MockRNG.makeRoll(4, 4); // rolls doubles
      let nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].inJail).toBe(false);
      expect(nextState.players[0].position).toBe(18); // 10 + 8 = Calabar
      expect(nextState.phase).toBe("awaiting-buy-decision");

      // Buy first to transition to awaiting-end-turn
      nextState = applyAction(nextState, "p1", { type: "BUY" });
      // Doubles out of jail does not grant another turn
      nextState = applyAction(nextState, "p1", { type: "END_TURN" });
      expect(nextState.currentPlayerIndex).toBe(1); // advances to p2
    });

    it("keeps player in jail on non-doubles, increments jailTurns", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].inJail = true;
      state.players[0].position = 10;

      const mockRng = MockRNG.makeRoll(1, 2); // no doubles
      let nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].inJail).toBe(true);
      expect(nextState.players[0].jailTurns).toBe(1);
      expect(nextState.phase).toBe("awaiting-end-turn");

      nextState = applyAction(nextState, "p1", { type: "END_TURN" });
      expect(nextState.currentPlayerIndex).toBe(1); // advances to p2
    });

    it("forces player to pay fine and move on 3rd failed roll", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].inJail = true;
      state.players[0].position = 10;
      state.players[0].jailTurns = 2; // already failed twice

      const mockRng = MockRNG.makeRoll(2, 3); // fails again (3rd time)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].inJail).toBe(false);
      expect(nextState.players[0].jailTurns).toBe(0);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - JAIL_FINE);
      expect(nextState.players[0].position).toBe(15); // Nnamdi Azikiwe Airport (10 + 5)
      expect(nextState.phase).toBe("awaiting-buy-decision");
    });

    it("allows player to pay fine before rolling to release them", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].inJail = true;
      state.players[0].position = 10;

      // Pay fine
      let nextState = applyAction(state, "p1", { type: "PAY_JAIL_FINE" });
      expect(nextState.players[0].inJail).toBe(false);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - JAIL_FINE);
      expect(nextState.phase).toBe("awaiting-roll");

      // Roll normally
      const mockRng = MockRNG.makeRoll(2, 2); // rolls doubles -> Tax (pos 14 is Enugu)
      nextState = applyAction(nextState, "p1", { type: "ROLL" }, mockRng.getRNG());
      expect(nextState.players[0].position).toBe(14);
      expect(nextState.doublesCount).toBe(1); // normal double counts
    });

    it("allows player to use card before rolling to release them", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].inJail = true;
      state.players[0].position = 10;
      state.players[0].jailCardSources = ["chance"];
      // Remove ch07 to simulate having drawn it
      state.chanceOrder = state.chanceOrder.filter((id) => id !== "ch07");

      // Use card
      let nextState = applyAction(state, "p1", { type: "USE_JAIL_CARD" });
      expect(nextState.players[0].inJail).toBe(false);
      expect(nextState.players[0].jailCardSources).toHaveLength(0);
      expect(nextState.phase).toBe("awaiting-roll");
      expect(nextState.chanceOrder).toContain("ch07"); // returned to deck

      // Roll normally
      const mockRng = MockRNG.makeRoll(1, 2);
      nextState = applyAction(nextState, "p1", { type: "ROLL" }, mockRng.getRNG());
      expect(nextState.players[0].position).toBe(13); // Onitsha (10 + 3)
    });
  });

  describe("Property Buying & Rent Calculations", () => {
    it("handles property buying", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1; // Ajegunle (pos 1, price 60k)
      state.phase = "awaiting-buy-decision";

      const nextState = applyAction(state, "p1", { type: "BUY" });
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 60_000);
      expect(nextState.tiles[1].ownerId).toBe("p1");
      expect(nextState.phase).toBe("awaiting-end-turn");
    });

    it("calculates base rent when landed on by another player", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1"; // p1 owns Ajegunle

      state.players[1].position = 0; // p2 at START
      state.currentPlayerIndex = 1; // p2's turn

      // E.g. p2 is at pos 37. Lands on pos 1 (Ajegunle) with a roll of 4 (2, 2):
      // pos 37 + 4 = 41 % 40 = pos 1.
      state.players[1].position = 37;
      const mockRng2 = MockRNG.makeRoll(2, 2); // roll 4, lands on Ajegunle
      let nextState = applyAction(state, "p2", { type: "ROLL" }, mockRng2.getRNG());

      // p2 should pay 2,000 rent to p1 and collect 200,000 for passing START.
      expect(nextState.players[1].cash).toBe(STARTING_CASH + GO_SALARY - 2_000);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 2_000);
    });

    it("doubles rent on unimproved full color group", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1"; // p1 owns Ajegunle
      state.tiles[3].ownerId = "p1"; // p1 owns Mushin (full brown group)

      state.players[1].position = 37; // lands on Ajegunle (pos 1) on roll of 4
      state.currentPlayerIndex = 1; // p2's turn
      const mockRng = MockRNG.makeRoll(2, 2);
      let nextState = applyAction(state, "p2", { type: "ROLL" }, mockRng.getRNG());

      // Base rent 2,000 doubled to 4,000, and p2 collects 200,000 for passing START.
      expect(nextState.players[1].cash).toBe(STARTING_CASH + GO_SALARY - 4_000);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 4_000);
    });

    it("calculates airport rent based on ownership count", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[5].ownerId = "p1"; // MM Airport
      state.tiles[15].ownerId = "p1"; // NA Airport (p1 owns 2 airports)

      state.players[1].position = 0;
      state.currentPlayerIndex = 1;
      const mockRng = MockRNG.makeRoll(2, 3); // roll 5 -> lands on pos 5 (MM Airport)
      let nextState = applyAction(state, "p2", { type: "ROLL" }, mockRng.getRNG());

      // Rent for 2 airports is 50,000
      expect(nextState.players[1].cash).toBe(STARTING_CASH - 50_000);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 50_000);
    });

    it("calculates utility rent based on dice total", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[12].ownerId = "p1"; // PHCN Electric

      state.players[1].position = 8; // Yaba
      state.currentPlayerIndex = 1;
      const mockRng = MockRNG.makeRoll(1, 3); // roll 4 -> lands on pos 12 (PHCN Electric)
      let nextState = applyAction(state, "p2", { type: "ROLL" }, mockRng.getRNG());

      // Rent is diceTotal * 4 = 4 * 4 = 16 (since p1 owns 1 utility)
      expect(nextState.players[1].cash).toBe(STARTING_CASH - 16);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 16);
    });
  });

  describe("Chance and Hustle Cards", () => {
    it("handles money cards", () => {
      const state = createGame(["p1", "p2"]);
      // force CHANCE_CARDS ch02 ("Opay pay you POS dividend. Collect ₦50,000") to be on top
      state.chanceOrder = ["ch02"];
      state.players[0].position = 5; // MM Airport

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 7 (Chance)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].cash).toBe(STARTING_CASH + 50_000);
      expect(nextState.phase).toBe("awaiting-end-turn");
    });

    it("handles moveTo cards with GO salary check", () => {
      const state = createGame(["p1", "p2"]);
      // force ch04 ("Waka go Banana Island" collectIfPass = true)
      state.chanceOrder = ["ch04"];
      state.players[0].position = 35; // Jabi

      // Let's position player at pos 34 (Maitama). Roll 2 (1, 1) -> lands on pos 36 (Chance)
      state.players[0].position = 34;
      const mockRng2 = MockRNG.makeRoll(1, 1);
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng2.getRNG());

      // Moved to Banana Island (pos 39). Since target 39 > current 36, didn't pass START.
      expect(nextState.players[0].position).toBe(39);
      expect(nextState.players[0].cash).toBe(STARTING_CASH); // no go salary
    });

    it("handles repairs card", () => {
      const state = createGame(["p1", "p2"]);
      // force ch08 ("Rainy season general repairs: pay ₦40,000 per house, ₦115,000 per hotel")
      state.chanceOrder = ["ch08"];
      state.players[0].position = 5; // MM Airport
      // Give player some properties with houses
      state.tiles[1] = { ownerId: "p1", houses: 2, mortgaged: false }; // 2 houses
      state.tiles[3] = { ownerId: "p1", houses: 5, mortgaged: false }; // hotel (5 houses equivalent)

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 7 (Chance)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      // Cost = 2 houses * 40k + 1 hotel * 115k = 80k + 115k = 195,000
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 195_000);
    });

    it("handles nearestAirport card with double rent", () => {
      const state = createGame(["p1", "p2"]);
      // force ch09 ("nearest airport; if owned, pay double")
      state.chanceOrder = ["ch09"];
      state.tiles[15] = { ownerId: "p2", houses: 0, mortgaged: false }; // p2 owns NA Airport (pos 15)
      // p1 owns no airports, so airport rent level is 1 airport owned (rent = 25,000)

      state.players[0].position = 5; // MM airport
      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 7 (Chance)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      // Nearest airport is pos 15 (NA Airport). Owned by p2.
      // Rent is 25,000 doubled = 50,000.
      expect(nextState.players[0].position).toBe(15);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 50_000);
      expect(nextState.players[1].cash).toBe(STARTING_CASH + 50_000);
    });

    it("handles nearestUtility card with 10x roll rent", () => {
      const state = createGame(["p1", "p2"]);
      // force ch16 ("nearest utility; roll dice again and pay 10x")
      state.chanceOrder = ["ch16"];
      state.tiles[12] = { ownerId: "p2", houses: 0, mortgaged: false }; // p2 owns PHCN Electric (pos 12)

      state.players[0].position = 5; // MM airport
      // We need a sequence of rolls:
      // Roll 1: [1, 1] to land on Chance (pos 7)
      // Roll 2 (inside nearestUtility action): [3, 4] (total 7) for utility rent
      const mockRng = MockRNG.makeSequence([
        [1, 1],
        [3, 4],
      ]);
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      // Moved to pos 12. Paid 7 * 10 = 70 Naira.
      expect(nextState.players[0].position).toBe(12);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 70);
      expect(nextState.players[1].cash).toBe(STARTING_CASH + 70);
    });

    it("drawing the NEPA chaos card opens the aimable blackout picker, then darkens the chosen zone", () => {
      const state = createGame(["p1", "p2"], { chaosMode: true });
      state.chanceOrder = ["cx01"]; // force NEPA Load-Shedding on top of the deck
      // p1 owns a brown property so the brown zone is a legal blackout target.
      state.tiles[1] = { ownerId: "p1", houses: 0, mortgaged: false };
      state.players[0].position = 5; // MM Airport

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 7 (Chance)
      let s = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      // The redesigned card no longer inflicts a global blackout — it hands the
      // drawer an aimable choice (a decision, not a passive swing).
      expect(s.phase).toBe("awaiting-blackout-target");
      expect(s.blackout).toBeNull();
      expect(s.pendingBlackout?.drawerId).toBe("p1");
      expect(s.pendingBlackout?.selectableZones).toContain("brown");

      // The drawer aims the blackout at the brown zone.
      s = applyAction(s, "p1", { type: "CHOOSE_BLACKOUT_ZONE", zone: "brown" });
      expect(s.blackout).not.toBeNull();
      expect(s.blackout?.zone).toBe("brown");
      expect(s.blackout?.untilRound).toBe(2); // currentTurn (1) + 1
      expect(s.phase).toBe("awaiting-end-turn");
    });

    it("waives all rent during a blackout, then restores it when the round wraps", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[3] = { ownerId: "p1", houses: 0, mortgaged: false }; // p1 owns Mushin (pos 3)
      state.blackout = { untilRound: 2 };
      state.currentTurn = 1;
      state.currentPlayerIndex = 1; // p2's turn
      state.players[1].position = 0;

      // p2 rolls 3 -> lands on p1's Mushin. Blackout: no rent changes hands.
      const roll = MockRNG.makeRoll(1, 2);
      let s = applyAction(state, "p2", { type: "ROLL" }, roll.getRNG());
      expect(s.players[1].position).toBe(3);
      expect(s.players[1].cash).toBe(STARTING_CASH); // paid nothing
      expect(s.players[0].cash).toBe(STARTING_CASH); // collected nothing
      expect(s.blackout).not.toBeNull();

      // p2 ends turn -> wraps back to p1, round -> 2, light restored.
      s = applyAction(s, "p2", { type: "END_TURN" });
      expect(s.currentTurn).toBe(2);
      expect(s.blackout).toBeNull();
    });
  });

  describe("Building and Mortgaging", () => {
    it("handles building houses evenly and deducting cost", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1"; // Ajegunle
      state.tiles[3].ownerId = "p1"; // Mushin

      // Build 1st house on Ajegunle
      let nextState = applyAction(state, "p1", { type: "BUILD", pos: 1 });
      expect(nextState.tiles[1].houses).toBe(1);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 50_000); // houseCost is 50,000

      // Cannot build 2nd house on Ajegunle until Mushin has 1st house
      expect(() => applyAction(nextState, "p1", { type: "BUILD", pos: 1 })).toThrow(
        "You must build evenly",
      );

      // Build 1st house on Mushin
      nextState = applyAction(nextState, "p1", { type: "BUILD", pos: 3 });
      expect(nextState.tiles[3].houses).toBe(1);

      // Now we can build 2nd house on Ajegunle
      nextState = applyAction(nextState, "p1", { type: "BUILD", pos: 1 });
      expect(nextState.tiles[1].houses).toBe(2);
    });

    it("prevents building if a property in the group is mortgaged", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1";
      state.tiles[3].ownerId = "p1";
      state.tiles[3].mortgaged = true;

      expect(() => applyAction(state, "p1", { type: "BUILD", pos: 1 })).toThrow(
        "Cannot build when any property in the group is mortgaged",
      );
    });

    it("handles selling houses evenly and refunding half cost", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1] = { ownerId: "p1", houses: 2, mortgaged: false };
      state.tiles[3] = { ownerId: "p1", houses: 2, mortgaged: false };

      // Sell 1 house from Ajegunle
      let nextState = applyAction(state, "p1", { type: "SELL_HOUSE", pos: 1 });
      expect(nextState.tiles[1].houses).toBe(1);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 25_000); // 50,000 / 2

      // Cannot sell another house from Ajegunle because Mushin still has 2
      expect(() => applyAction(nextState, "p1", { type: "SELL_HOUSE", pos: 1 })).toThrow(
        "You must sell buildings evenly",
      );

      // Sell house from Mushin
      nextState = applyAction(nextState, "p1", { type: "SELL_HOUSE", pos: 3 });
      expect(nextState.tiles[3].houses).toBe(1);
    });

    it("handles mortgaging properties and payouts", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1"; // Ajegunle (mortgage value 30,000)

      let nextState = applyAction(state, "p1", { type: "MORTGAGE", pos: 1 });
      expect(nextState.tiles[1].mortgaged).toBe(true);
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 30_000);
    });

    it("prevents mortgaging if any property in group has buildings", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1] = { ownerId: "p1", houses: 1, mortgaged: false };
      state.tiles[3] = { ownerId: "p1", houses: 0, mortgaged: false };

      // Try to mortgage Mushin (has 0 houses, but Ajegunle has 1)
      expect(() => applyAction(state, "p1", { type: "MORTGAGE", pos: 3 })).toThrow(
        "Must sell all buildings in the color group before mortgaging",
      );
    });

    it("handles unmortgaging with 10% interest", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1] = { ownerId: "p1", houses: 0, mortgaged: true }; // Ajegunle (mortgage 30,000)

      let nextState = applyAction(state, "p1", { type: "UNMORTGAGE", pos: 1 });
      expect(nextState.tiles[1].mortgaged).toBe(false);
      // Cost is 30,000 + 10% = 33,000
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 33_000);
    });
  });

  describe("Auctions, Trading, and Bankruptcy", () => {
    it("handles open-outcry bidding, a pass, and winning", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1; // Ajegunle (₦60k -> increments 10k/20k/50k)
      state.phase = "awaiting-buy-decision";

      // Decline buy -> triggers auction
      let nextState = applyAction(state, "p1", { type: "DECLINE_BUY" });
      expect(nextState.phase).toBe("auction");
      expect(nextState.auctionState).toBeDefined();
      expect(nextState.auctionState?.tilePos).toBe(1);
      expect(nextState.auctionState?.participantIds).toEqual(["p1", "p2"]);
      expect(nextState.auctionState?.passedIds).toEqual([]);
      expect(nextState.auctionState?.bidIncrements).toEqual([10_000, 20_000, 50_000]);

      // p1 bids the smallest increment (raise of 10k from 0)
      nextState = applyAction(nextState, "p1", { type: "BID", amount: 10_000 });
      expect(nextState.auctionState?.highestBid).toBe(10_000);
      expect(nextState.auctionState?.highestBidderId).toBe("p1");
      // p2 is still in the running, so the auction continues
      expect(nextState.phase).toBe("auction");

      // p2 passes -> no challenger remains, p1 wins
      nextState = applyAction(nextState, "p2", { type: "PASS_BID" });
      expect(nextState.phase).toBe("awaiting-end-turn");
      expect(nextState.tiles[1].ownerId).toBe("p1");
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 10_000);
      expect(nextState.auctionState).toBeNull();
    });

    it("handles auctions where everyone passes with no sale", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1;
      state.phase = "awaiting-buy-decision";

      let nextState = applyAction(state, "p1", { type: "DECLINE_BUY" });

      // p1 passes
      nextState = applyAction(nextState, "p1", { type: "PASS_BID" });
      // p2 passes
      nextState = applyAction(nextState, "p2", { type: "PASS_BID" });

      expect(nextState.phase).toBe("awaiting-end-turn");
      expect(nextState.tiles[1].ownerId).toBeNull();
      expect(nextState.auctionState).toBeNull();
    });

    it("rejects bids that are not one of the set increments", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1;
      state.phase = "awaiting-buy-decision";
      const auctionState = applyAction(state, "p1", { type: "DECLINE_BUY" });

      // 15k is not a legal raise (allowed: 10k/20k/50k)
      expect(() => applyAction(auctionState, "p1", { type: "BID", amount: 15_000 })).toThrow();
    });

    it("lets any non-folded player raise at any time (no strict turn order)", () => {
      const state = createGame(["p1", "p2", "p3"]);
      state.players[0].position = 1;
      state.phase = "awaiting-buy-decision";
      let s = applyAction(state, "p1", { type: "DECLINE_BUY" });

      // p2 opens, then p3 jumps in, then p1 tops it — all out of any turn order
      s = applyAction(s, "p2", { type: "BID", amount: 10_000 });
      s = applyAction(s, "p3", { type: "BID", amount: 30_000 }); // +20k
      s = applyAction(s, "p1", { type: "BID", amount: 50_000 }); // +20k
      expect(s.auctionState?.highestBid).toBe(50_000);
      expect(s.auctionState?.highestBidderId).toBe("p1");
      expect(s.phase).toBe("auction");

      // the standing top bidder cannot bid against themselves
      expect(() => applyAction(s, "p1", { type: "BID", amount: 70_000 })).toThrow();
      // ...nor pass on their own winning bid
      expect(() => applyAction(s, "p1", { type: "PASS_BID" })).toThrow();
    });

    it("resolves to the top bidder when the timer expires", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1;
      state.phase = "awaiting-buy-decision";
      let s = applyAction(state, "p1", { type: "DECLINE_BUY" });
      s = applyAction(s, "p2", { type: "BID", amount: 20_000 });

      // Server fires RESOLVE_AUCTION when the countdown hits zero
      s = applyAction(s, "__server__", { type: "RESOLVE_AUCTION" });
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.tiles[1].ownerId).toBe("p2");
      expect(s.players[1].cash).toBe(STARTING_CASH - 20_000);
      expect(s.auctionState).toBeNull();
    });

    it("closes with no sale if the timer expires before any bid", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1;
      state.phase = "awaiting-buy-decision";
      let s = applyAction(state, "p1", { type: "DECLINE_BUY" });

      s = applyAction(s, "__server__", { type: "RESOLVE_AUCTION" });
      expect(s.phase).toBe("awaiting-end-turn");
      expect(s.tiles[1].ownerId).toBeNull();
      expect(s.auctionState).toBeNull();
    });

    it("handles trade proposals and acceptances", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1"; // p1 owns Ajegunle
      state.tiles[5].ownerId = "p2"; // p2 owns MM Airport

      // Propose trade: p1 offers Ajegunle and ₦50,000 to p2 in exchange for MM Airport
      const tradeOffer = {
        fromId: "p1",
        toId: "p2",
        giveCash: 50_000,
        getCash: 0,
        giveTiles: [1],
        getTiles: [5],
      };

      let nextState = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: tradeOffer });
      expect(nextState.activeTrade).toEqual(tradeOffer);

      // p2 accepts trade (needs p2 playerId)
      nextState = applyAction(nextState, "p2", { type: "RESPOND_TRADE", accept: true });
      expect(nextState.activeTrade).toBeNull();
      expect(nextState.tiles[1].ownerId).toBe("p2");
      expect(nextState.tiles[5].ownerId).toBe("p1");
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 50_000);
      expect(nextState.players[1].cash).toBe(STARTING_CASH + 50_000);
    });

    it("does not let a responder counter an active trade off-turn via PROPOSE_TRADE", () => {
      const state = createGame(["p1", "p2"]);
      state.phase = "awaiting-end-turn";
      state.tiles[1].ownerId = "p1";
      state.tiles[3].ownerId = "p2";

      const tradeOffer = {
        fromId: "p1",
        toId: "p2",
        giveCash: 0,
        getCash: 0,
        giveTiles: [1],
        getTiles: [3],
      };

      const proposed = applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: tradeOffer });
      expect(proposed.activeTrade).toEqual(tradeOffer);

      // A second PROPOSE_TRADE while one is already on the table must be
      // rejected outright rather than silently overwriting the pending offer
      // (proposing itself is legal off-turn — the guard here is the one-at-a-
      // time rule, not whose turn it is).
      const counterOffer = {
        fromId: "p2",
        toId: "p1",
        giveCash: 0,
        getCash: 0,
        giveTiles: [3],
        getTiles: [1],
      };
      expect(() =>
        applyAction(proposed, "p2", { type: "PROPOSE_TRADE", trade: counterOffer }),
      ).toThrow("Another trade is already pending");

      // The original trade remains intact and untouched.
      expect(proposed.activeTrade).toEqual(tradeOffer);
      expect(proposed.activeTrade?.toId).toBe("p2");
    });

    it("lets any player propose a trade off-turn, in any non-auction phase", () => {
      const state = createGame(["p1", "p2"]);
      // It is p1's turn and they've landed on an unowned tile (a phase that
      // previously blocked all trade proposals).
      state.currentPlayerIndex = 0;
      state.phase = "awaiting-buy-decision";
      state.tiles[1].ownerId = "p1";
      state.tiles[3].ownerId = "p2";

      // p2 — NOT the current player — proposes a trade to p1.
      const offer = {
        fromId: "p2",
        toId: "p1",
        giveCash: 0,
        getCash: 0,
        giveTiles: [3],
        getTiles: [1],
      };
      const next = applyAction(state, "p2", { type: "PROPOSE_TRADE", trade: offer });
      expect(next.activeTrade).toEqual(offer);
      // The turn/phase are untouched by the proposal.
      expect(next.phase).toBe("awaiting-buy-decision");
      expect(next.currentPlayerIndex).toBe(0);
    });

    it("blocks trade proposals during an auction", () => {
      const state = createGame(["p1", "p2"]);
      state.phase = "auction";
      state.tiles[1].ownerId = "p1";
      state.tiles[3].ownerId = "p2";
      const offer = {
        fromId: "p1",
        toId: "p2",
        giveCash: 0,
        getCash: 0,
        giveTiles: [1],
        getTiles: [3],
      };
      expect(() =>
        applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: offer }),
      ).toThrow("Cannot propose trade in phase auction");
    });

    it("rejects trade offers with non-integer or NaN cash (wire poisoning)", () => {
      const state = createGame(["p1", "p2"]);
      state.tiles[1].ownerId = "p1";

      // NaN would slip past every `<` comparison and poison a player's cash.
      const nanOffer = {
        fromId: "p1",
        toId: "p2",
        giveCash: NaN,
        getCash: 0,
        giveTiles: [1],
        getTiles: [],
      };
      expect(() => applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: nanOffer })).toThrow();

      // Fractional Naira breaks the integer-money invariant.
      const floatOffer = { ...nanOffer, giveCash: 0.5 };
      expect(() =>
        applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: floatOffer }),
      ).toThrow();

      // Missing tile arrays.
      const badTiles = { fromId: "p1", toId: "p2", giveCash: 0, getCash: 0 } as unknown as {
        fromId: string;
        toId: string;
        giveCash: number;
        getCash: number;
        giveTiles: number[];
        getTiles: number[];
      };
      expect(() => applyAction(state, "p1", { type: "PROPOSE_TRADE", trade: badTiles })).toThrow();
    });

    it("rejects non-integer bid amounts", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1;
      state.phase = "awaiting-buy-decision";
      const s = applyAction(state, "p1", { type: "DECLINE_BUY" });
      expect(() => applyAction(s, "p1", { type: "BID", amount: NaN })).toThrow();
      expect(() => applyAction(s, "p1", { type: "BID", amount: 10_000.5 })).toThrow();
    });

    it("handles bankruptcy and property transfers to creditor", () => {
      const state = createGame(["p1", "p2"]);
      // p1 owns Mushin (pos 3), developed with 1 house (rent level 1 = 20,000)
      state.tiles[3] = { ownerId: "p1", houses: 1, mortgaged: false };
      state.tiles[1] = { ownerId: "p2", houses: 0, mortgaged: false }; // p2 owns Ajegunle

      // Move p2 to Ajegunle (pos 1), set p2 cash to 5,000
      state.players[1].position = 1;
      state.players[1].cash = 5_000;
      state.currentPlayerIndex = 1; // p2's turn

      // p2 is at pos 1, rolls a 2 (1,1) to land on Mushin (pos 3) without passing START
      const mockRng2 = MockRNG.makeRoll(1, 1);
      let nextState = applyAction(state, "p2", { type: "ROLL" }, mockRng2.getRNG());

      // rent is 20,000. p2 has ₦5,000 < rent, so a DebtRecord is created
      // and p2's cash is NOT deducted (deferred to settlement).
      expect(nextState.players[1].cash).toBe(5_000); // cash untouched
      expect(nextState.debtLedger.length).toBeGreaterThan(0);
      expect(nextState.debtLedger[0].creditorId).toBe("p1");

      // p2 declares bankruptcy
      nextState = applyAction(nextState, "p2", { type: "DECLARE_BANKRUPT" });
      expect(nextState.players[1].bankrupt).toBe(true);
      expect(nextState.tiles[1].ownerId).toBe("p1"); // transferred to p1
      expect(nextState.winnerId).toBe("p1");
      expect(nextState.phase).toBe("game-over");
      // p1 received p2's ₦5k cash via debt settlement
      expect(nextState.players[0].cash).toBe(STARTING_CASH + 5_000);
    });

    it("allows negative cash players to roll but blocks END_TURN", () => {
      const state = createGame(["p1", "p2"]);

      // Let's set p1 to own Mushin (pos 3)
      state.tiles[3] = { ownerId: "p1", houses: 0, mortgaged: false };

      // Set p1 cash to -50k, and start p1's turn at awaiting-roll
      state.players[0].cash = -50_000;
      state.currentPlayerIndex = 0;
      state.phase = "awaiting-roll";

      // 1. Verify player can roll while negative
      const mockRng = MockRNG.makeRoll(1, 2); // rolls 3 -> land on Mushin (pos 3)
      let nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].position).toBe(3);
      // Since p1 owns Mushin, landing on it resolves and transitions directly to awaiting-end-turn
      expect(nextState.phase).toBe("awaiting-end-turn");
      expect(nextState.players[0].cash).toBe(-50_000);

      // 2. Verify p1 cannot end turn with negative cash
      expect(() => applyAction(nextState, "p1", { type: "END_TURN" })).toThrow(
        "Cannot end turn with negative cash",
      );

      // 3. Mortgage property to raise cash
      nextState = applyAction(nextState, "p1", { type: "MORTGAGE", pos: 3 });
      // mortgage value is 30,000. New cash: -50,000 + 30,000 = -20,000. Still negative.
      expect(nextState.players[0].cash).toBe(-20_000);

      // 4. Verify cannot end turn yet
      expect(() => applyAction(nextState, "p1", { type: "END_TURN" })).toThrow(
        "Cannot end turn with negative cash",
      );

      // 5. Give some cash (e.g. from trade or gift) to make positive
      nextState.players[0].cash = 10_000;

      // 6. Verify p1 can now end turn
      const finalState = applyAction(nextState, "p1", { type: "END_TURN" });
      expect(finalState.currentPlayerIndex).toBe(1); // advances to p2
      expect(finalState.phase).toBe("awaiting-roll");
    });
  });

  describe("Lobby Settings & Retheming", () => {
    it("supports custom starting cash in createGame", () => {
      const state = createGame(["p1", "p2"], { startingCash: 1_000_000 });
      expect(state.players[0].cash).toBe(1_000_000);
      expect(state.settings.startingCash).toBe(1_000_000);
    });

    it("redirects tax payments to freeParkingPot when enabled", () => {
      const state = createGame(["p1", "p2"], { freeParkingJackpot: true });
      state.players[0].position = 2; // Hustle Box
      state.currentPlayerIndex = 0;

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 4 (FIRS Income Tax, 200k)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.freeParkingPot).toBe(200_000);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 200_000);
      expect(nextState.log[nextState.log.length - 1]).toContain("added to Mama Put Pot");
    });

    it("pays out freeParkingPot on Mama Put Rest Stop landing", () => {
      const state = createGame(["p1", "p2"], { freeParkingJackpot: true });
      state.freeParkingPot = 350_000;
      state.players[0].position = 18; // Calabar (pos 18)
      state.currentPlayerIndex = 0;

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 20 (Mama Put Rest Stop)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].cash).toBe(STARTING_CASH + 350_000);
      expect(nextState.freeParkingPot).toBe(0);
      expect(nextState.log[nextState.log.length - 1]).toContain(
        "collected the Mama Put Pot of ₦350,000",
      );
    });

    it("ends game and calculates winner by net worth when turn limit is reached", () => {
      // Set turn limit to 1 round
      const state = createGame(["p1", "p2"], { turnLimit: 1 });

      // Let's make p1 own surulere (pos 9, price 120k) and built a Bungalow (houseCost 50k)
      state.tiles[9] = { ownerId: "p1", houses: 1, mortgaged: false };
      state.players[0].cash = 1_500_000 - 120_000 - 50_000;

      // Let's make p1 own another unmortgaged property to ensure p1 has higher net worth
      state.tiles[1] = { ownerId: "p1", houses: 0, mortgaged: false }; // Ajegunle (price 60k)
      state.players[0].cash -= 60_000;
      state.players[0].cash += 5_000; // p1 has 1,505,000 net worth

      state.currentPlayerIndex = 0;
      state.phase = "awaiting-end-turn";

      // End p1's turn
      let nextState = applyAction(state, "p1", { type: "END_TURN" });
      expect(nextState.currentPlayerIndex).toBe(1);
      expect(nextState.currentTurn).toBe(1);

      // Now it's p2's turn. End p2's turn. This completes Round 1 and wraps around back to p1 (index 0 < current index 1).
      nextState.phase = "awaiting-end-turn";
      const finalState = applyAction(nextState, "p2", { type: "END_TURN" });

      expect(finalState.phase).toBe("game-over");
      expect(finalState.winnerId).toBe("p1"); // p1 wins due to higher net worth
      expect(finalState.log[finalState.log.length - 1]).toContain(
        "wins the game with a net worth of ₦1,505,000",
      );
    });
  });

  describe("FORFEIT action (player leaves mid-game)", () => {
    it("eliminates a non-current player and returns their properties to the bank", () => {
      const state = createGame(["p1", "p2", "p3"]);
      state.tiles[1] = { ownerId: "p2", houses: 0, mortgaged: false };
      state.tiles[3] = { ownerId: "p2", houses: 2, mortgaged: false };
      state.currentPlayerIndex = 0; // p1's turn; p2 (not current) leaves

      const next = applyAction(state, "p2", { type: "FORFEIT" });

      expect(next.players[1].bankrupt).toBe(true);
      expect(next.tiles[1].ownerId).toBeNull();
      expect(next.tiles[3].ownerId).toBeNull();
      expect(next.tiles[3].houses).toBe(0);
      // Game continues; it's still p1's turn.
      expect(next.phase).toBe("awaiting-roll");
      expect(next.currentPlayerIndex).toBe(0);
      expect(next.winnerId).toBeNull();
    });

    it("advances the turn when the current player forfeits", () => {
      const state = createGame(["p1", "p2", "p3"]);
      state.currentPlayerIndex = 0;
      state.phase = "awaiting-roll";

      const next = applyAction(state, "p1", { type: "FORFEIT" });

      expect(next.players[0].bankrupt).toBe(true);
      expect(next.currentPlayerIndex).toBe(1); // advanced to p2
      expect(next.phase).toBe("awaiting-roll");
    });

    it("ends the game when only one player remains", () => {
      const state = createGame(["p1", "p2"]);
      state.currentPlayerIndex = 0;

      const next = applyAction(state, "p2", { type: "FORFEIT" });

      expect(next.players[1].bankrupt).toBe(true);
      expect(next.winnerId).toBe("p1");
      expect(next.phase).toBe("game-over");
    });

    it("cancels a pending trade involving the leaver", () => {
      const state = createGame(["p1", "p2", "p3"]);
      state.activeTrade = {
        fromId: "p2",
        toId: "p1",
        giveCash: 0,
        getCash: 50_000,
        giveTiles: [],
        getTiles: [],
      };

      const next = applyAction(state, "p2", { type: "FORFEIT" });

      expect(next.activeTrade).toBeNull();
    });

    it("is a no-op when the player has already left", () => {
      const state = createGame(["p1", "p2", "p3"]);
      const once = applyAction(state, "p2", { type: "FORFEIT" });
      const twice = applyAction(once, "p2", { type: "FORFEIT" });

      // Second forfeit changes nothing meaningful (still bankrupt, same turn owner).
      expect(twice.players[1].bankrupt).toBe(true);
      expect(twice.currentPlayerIndex).toBe(once.currentPlayerIndex);
    });

    it("does not strand the turn when the decliner forfeits mid-auction", () => {
      const state = createGame(["p1", "p2", "p3"]);
      state.currentPlayerIndex = 0; // p1 declined and triggered the auction
      state.phase = "auction";
      state.auctionState = {
        tilePos: 1,
        highestBid: 0,
        highestBidderId: null,
        participantIds: ["p1", "p2", "p3"],
        passedIds: [],
        minIncrement: 10_000,
        bidIncrements: [10_000, 50_000],
        bidDurationMs: 12_000,
        deadline: null,
      };

      // p1 (the current player) leaves during the auction.
      let next = applyAction(state, "p1", { type: "FORFEIT" });
      expect(next.players[0].bankrupt).toBe(true);
      expect(next.auctionState?.participantIds).toEqual(["p2", "p3"]);
      expect(next.phase).toBe("auction"); // contest continues among p2 & p3

      // The remaining players fold; the auction must close AND hand the turn to a
      // live player instead of stranding it on the departed decliner.
      next = applyAction(next, "p2", { type: "PASS_BID" });
      next = applyAction(next, "p3", { type: "PASS_BID" });

      expect(next.phase).toBe("awaiting-roll");
      expect(next.players[next.currentPlayerIndex].bankrupt).toBe(false);
    });
  });

  describe("Vote-kick (Commot)", () => {
    it("tallies a vote without kicking below majority", () => {
      const state = createGame(["p1", "p2", "p3"]);
      const next = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      expect(next.votekicks["p3"]).toEqual(["p1"]);
      const target = next.players.find((p) => p.id === "p3")!;
      expect(target.bankrupt).toBe(false);
      expect(target.kicked).toBeFalsy();
    });

    it("allows any active player to vote off-turn", () => {
      const state = createGame(["p1", "p2", "p3"]);
      expect(state.currentPlayerIndex).toBe(0); // p1's turn
      // p2 voting is off-turn but must be allowed.
      const next = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" });
      expect(next.votekicks["p3"]).toEqual(["p2"]);
    });

    it("eliminates the target once votes pass half the active players", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" });
      const target = state.players.find((p) => p.id === "p3")!;
      expect(target.kicked).toBe(true);
      expect(target.bankrupt).toBe(true); // eliminated via the FORFEIT path
      expect(state.players.filter((p) => !p.bankrupt)).toHaveLength(2);
    });

    it("rejects voting for yourself", () => {
      const state = createGame(["p1", "p2", "p3"]);
      expect(() => applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p1" })).toThrow();
    });

    it("rejects voting for the same player twice", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      expect(() => applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" })).toThrow();
    });

    it("rejects voting against an already-eliminated player", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state = applyAction(state, "p3", { type: "FORFEIT" });
      expect(() => applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" })).toThrow();
    });

    it("does not let a stale voter's vote count toward majority", () => {
      let state = createGame(["p1", "p2", "p3", "p4", "p5"]);
      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p5" });
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p5" });
      // 2 votes tallied, 5 active players -> no kick yet.
      expect(state.players.find((p) => p.id === "p5")!.bankrupt).toBe(false);

      state = applyAction(state, "p1", { type: "FORFEIT" });
      state = applyAction(state, "p2", { type: "FORFEIT" });
      // Active players are now p3, p4, p5. Only p3 casts a live vote.
      state = applyAction(state, "p3", { type: "VOTE_KICK", targetId: "p5" });

      const target = state.players.find((p) => p.id === "p5")!;
      // One live vote (p3) among 3 active players is not a majority.
      expect(target.bankrupt).toBe(false);
    });

    it("cleans up a voter's vote when that voter forfeits", () => {
      let state = createGame(["p1", "p2", "p3", "p4"]);
      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p4" });
      state = applyAction(state, "p1", { type: "FORFEIT" });
      expect(state.votekicks["p4"]).not.toContain("p1");
    });

    it("clears debtLedger when the current (indebted) player is vote-kicked", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state.currentPlayerIndex = 2;
      state.phase = "awaiting-buy-decision";
      state.debtLedger = [{ debtorId: "p3", creditorId: "p1", amount: 5_000 }];
      state.players[2].cash = 0;

      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" }); // majority -> FORFEIT p3

      expect(state.players[2].bankrupt).toBe(true);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.debtLedger.filter((d) => d.debtorId === "p3")).toHaveLength(0);
    });

    it("does not misroute a later bankruptcy to a stale creditor", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state.currentPlayerIndex = 2;
      state.phase = "awaiting-buy-decision";
      state.debtLedger = [{ debtorId: "p3", creditorId: "p1", amount: 5_000 }];
      state.players[2].cash = 0;

      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" }); // majority -> FORFEIT p3, debts written off

      // Now an unrelated bankruptcy happens: p2 is in debt and declares bankrupt.
      state.tiles[3].ownerId = "p2";
      state.debtLedger = [{ debtorId: "p2", creditorId: "bank", amount: 1 }];
      state.players[1].cash = 0;
      state.currentPlayerIndex = 1; // make it p2's own turn context

      state = applyAction(state, "p2", { type: "DECLARE_BANKRUPT" });

      // p2's property should go to the bank (debt was to bank)
      expect(state.tiles[3].ownerId).toBeNull();
    });

    it("kicks the standing high bidder mid-auction: bid voided, auction continues", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state.currentPlayerIndex = 0;
      state.phase = "auction";
      state.auctionState = {
        tilePos: 1,
        highestBid: 50_000,
        highestBidderId: "p3",
        participantIds: ["p1", "p2", "p3"],
        passedIds: ["p1"],
        minIncrement: 10_000,
        bidIncrements: [10_000, 20_000, 50_000],
        bidDurationMs: 12_000,
        deadline: null,
      };

      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" }); // majority -> FORFEIT p3

      expect(state.phase).toBe("auction");
      expect(state.auctionState?.highestBidderId).toBeNull();
      expect(state.auctionState?.highestBid).toBe(0);
      expect(state.auctionState?.participantIds).toEqual(["p1", "p2"]);
      expect(state.tiles[1].ownerId).toBeNull();
      expect(state.players[2].bankrupt).toBe(true);
    });

    it("kicking the sole remaining bidder (also current player) closes the auction with no sale and advances the turn", () => {
      let state = createGame(["p1", "p2", "p3"]);
      state.currentPlayerIndex = 2;
      state.phase = "auction";
      state.auctionState = {
        tilePos: 1,
        highestBid: 0,
        highestBidderId: null,
        participantIds: ["p1", "p2", "p3"],
        passedIds: ["p1", "p2"],
        minIncrement: 10_000,
        bidIncrements: [10_000, 20_000, 50_000],
        bidDurationMs: 12_000,
        deadline: null,
      };

      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" }); // majority -> FORFEIT p3

      expect(state.auctionState).toBeNull();
      expect(state.phase).toBe("awaiting-roll");
      expect(state.players[state.currentPlayerIndex].bankrupt).toBe(false);
      expect(state.tiles[1].ownerId).toBeNull();
    });

    it("vote-kick input purity: does not mutate the input state, and applies the majority kick", () => {
      const state = createGame(["p1", "p2", "p3"]);
      const s1 = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });
      const snapshot = JSON.stringify(s1);

      const s2 = applyAction(s1, "p2", { type: "VOTE_KICK", targetId: "p3" }); // majority -> recursive FORFEIT

      expect(JSON.stringify(s1)).toBe(snapshot);
      expect(s2.players[2].bankrupt).toBe(true);
    });
  });

  describe("Secret objectives", () => {
    it("does not fire an objective bonus from an unrelated player's action", () => {
      let state = createGame(["p1", "p2", "p3"], { secretObjectives: true });
      state.players.forEach((p) => {
        p.secretObjective = undefined;
        p.objectiveCompleted = false;
      });
      state.players[0].secretObjective = "cash_2m";
      state.players[0].cash = 2_000_000;
      state.players[0].objectiveCompleted = false;

      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" });

      expect(state.players[0].cash).toBe(2_000_000);
      expect(state.players[0].objectiveCompleted).toBe(false);
    });

    it("fires the objective bonus exactly once, only at the turn boundary", () => {
      let state = createGame(["p1", "p2"], { secretObjectives: true });
      state.players.forEach((p) => {
        p.secretObjective = undefined;
        p.objectiveCompleted = false;
      });
      state.players[0].secretObjective = "own_4_properties";
      state.tiles[1].ownerId = "p1";
      state.tiles[3].ownerId = "p1";
      state.tiles[6].ownerId = "p1";
      state.currentPlayerIndex = 0;
      state.phase = "awaiting-buy-decision";
      state.players[0].position = 8;
      state.players[0].cash = (BOARD[8] as { price: number }).price + 5;

      state = applyAction(state, "p1", { type: "BUY" }); // 4th property -> objective satisfied, but BUY is not a boundary
      expect(state.players[0].objectiveCompleted).toBe(false);
      expect(state.players[0].cash).toBe(5);

      state = applyAction(state, "p1", { type: "END_TURN" }); // boundary: bonus fires here

      expect(state.players[0].objectiveCompleted).toBe(true);
      expect(state.players[0].cash).toBe(5 + 500_000);
    });

    it("fires objectives at the boundary reached by a vote-kick, exactly once", () => {
      let state = createGame(["p1", "p2", "p3"], { secretObjectives: true });
      state.players.forEach((p) => {
        p.secretObjective = undefined;
        p.objectiveCompleted = false;
      });
      state.players[0].secretObjective = "cash_2m";
      state.players[0].cash = 2_000_000;
      state.players[0].objectiveCompleted = false;
      // Make the kick target (p3) the current player so eliminating them via
      // FORFEIT is forced to advance the turn — i.e. actually reaches a
      // turn boundary — rather than being a no-op on turn order.
      state.currentPlayerIndex = 2;

      // p2's vote alone is not a majority yet, so no kick happens and no
      // boundary is reached: no bonus.
      state = applyAction(state, "p2", { type: "VOTE_KICK", targetId: "p3" });
      expect(state.players[0].cash).toBe(2_000_000);
      expect(state.players[0].objectiveCompleted).toBe(false);

      // p1's vote reaches majority, recursively calling FORFEIT via
      // applyAction; that forfeit reaches a turn boundary, so the bonus
      // fires exactly once.
      state = applyAction(state, "p1", { type: "VOTE_KICK", targetId: "p3" });

      expect(state.players[0].cash).toBe(2_500_000);
      expect(state.players[0].objectiveCompleted).toBe(true);
      expect(state.players[2].bankrupt).toBe(true);
    });

    it("does not award if the objective is satisfied mid-turn but not at the turn boundary", () => {
      let state = createGame(["p1", "p2"], { secretObjectives: true });
      state.players.forEach((p) => {
        p.secretObjective = undefined;
        p.objectiveCompleted = false;
      });
      state.players[0].secretObjective = "cash_2m";
      state.currentPlayerIndex = 0;
      state.phase = "awaiting-buy-decision";
      state.players[0].position = 1;
      const price = (BOARD[1] as PropertyTile).price;
      state.players[0].cash = 2_000_000; // satisfies cash_2m mid-turn...
      state = applyAction(state, "p1", { type: "BUY" }); // ...buying drops below 2m; BUY is not a boundary
      expect(state.players[0].objectiveCompleted).toBe(false);
      state = applyAction(state, "p1", { type: "END_TURN" }); // boundary: cash < 2m now
      expect(state.players[0].objectiveCompleted).toBe(false);
      expect(state.players[0].cash).toBe(2_000_000 - price);
    });
  });
});
