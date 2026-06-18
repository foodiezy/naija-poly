import { describe, it, expect } from "vitest";
import { createGame, applyAction } from "./engine";
import { STARTING_CASH, GO_SALARY, JAIL_FINE } from "../data/board";

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
      expect(state.esusuOrder).toHaveLength(16);
      expect(state.chancePtr).toBe(0);
      expect(state.esusuPtr).toBe(0);
      expect(state.log[0]).toBe("Game started.");
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
      state.players[0].getOutOfJailCards = 1;
      // Remove ch07 to simulate having drawn it
      state.chanceOrder = state.chanceOrder.filter((id) => id !== "ch07");

      // Use card
      let nextState = applyAction(state, "p1", { type: "USE_JAIL_CARD" });
      expect(nextState.players[0].inJail).toBe(false);
      expect(nextState.players[0].getOutOfJailCards).toBe(0);
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

  describe("Chance and Esusu Cards", () => {
    it("handles money cards", () => {
      const state = createGame(["p1", "p2"]);
      // force CHANCE_CARDS ch02 ("NEPA don bring light. Collect ₦50,000") to be on top
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
      // force ch08 ("Generator don knock: pay ₦40,000 per house, ₦115,000 per hotel")
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
      const mockRng = MockRNG.makeSequence([[1, 1], [3, 4]]);
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      // Moved to pos 12. Paid 7 * 10 = 70 Naira.
      expect(nextState.players[0].position).toBe(12);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 70);
      expect(nextState.players[1].cash).toBe(STARTING_CASH + 70);
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
      expect(() => applyAction(nextState, "p1", { type: "BUILD", pos: 1 })).toThrow("You must build evenly");

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
        "Cannot build when any property in the group is mortgaged"
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
        "You must sell buildings evenly"
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
        "Must sell all buildings in the color group before mortgaging"
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
    it("handles auction bidding cycles, passes, and winning", () => {
      const state = createGame(["p1", "p2"]);
      state.players[0].position = 1; // Ajegunle
      state.phase = "awaiting-buy-decision";

      // Decline buy -> triggers auction
      let nextState = applyAction(state, "p1", { type: "DECLINE_BUY" });
      expect(nextState.phase).toBe("auction");
      expect(nextState.auctionState).toBeDefined();
      expect(nextState.auctionState?.tilePos).toBe(1);

      // p1 bids 10,000
      nextState = applyAction(nextState, "p1", { type: "BID", amount: 10_000 });
      expect(nextState.auctionState?.highestBid).toBe(10_000);
      expect(nextState.auctionState?.highestBidderId).toBe("p1");
      expect(nextState.auctionState?.currentPlayerIndex).toBe(1); // p2's turn to bid

      // p2 passes
      nextState = applyAction(nextState, "p2", { type: "PASS_BID" });
      // p1 wins
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

      // rent is 20,000. p2 cash: 5,000 - 20,000 = -15,000.
      expect(nextState.players[1].cash).toBe(-15_000);
      expect(nextState.owedToId).toBe("p1");

      // p2 declares bankruptcy
      nextState = applyAction(nextState, "p2", { type: "DECLARE_BANKRUPT" });
      expect(nextState.players[1].bankrupt).toBe(true);
      expect(nextState.tiles[1].ownerId).toBe("p1"); // transferred to p1
      expect(nextState.winnerId).toBe("p1");
      expect(nextState.phase).toBe("game-over");
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
      state.players[0].position = 2; // Esusu Box
      state.currentPlayerIndex = 0;

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 4 (FIRS Income Tax, 200k)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.freeParkingPot).toBe(200_000);
      expect(nextState.players[0].cash).toBe(STARTING_CASH - 200_000);
      expect(nextState.log[nextState.log.length - 1]).toContain("added to Bukka Rest Stop Pot");
    });

    it("pays out freeParkingPot on Bukka Rest Stop landing", () => {
      const state = createGame(["p1", "p2"], { freeParkingJackpot: true });
      state.freeParkingPot = 350_000;
      state.players[0].position = 18; // Calabar (pos 18)
      state.currentPlayerIndex = 0;

      const mockRng = MockRNG.makeRoll(1, 1); // roll 2 -> lands on pos 20 (Bukka Rest Stop)
      const nextState = applyAction(state, "p1", { type: "ROLL" }, mockRng.getRNG());

      expect(nextState.players[0].cash).toBe(STARTING_CASH + 350_000);
      expect(nextState.freeParkingPot).toBe(0);
      expect(nextState.log[nextState.log.length - 1]).toContain("collected the Bukka Pot of ₦350,000");
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
      expect(finalState.log[finalState.log.length - 1]).toContain("wins the game with a net worth of ₦1,505,000");
    });
  });
});
