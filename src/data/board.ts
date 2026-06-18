// =============================================================================
// board.ts — Nigerian-themed board definition for a Richup/Monopoly-style game
// -----------------------------------------------------------------------------
// This is PURE DATA + TYPES. No game logic lives here. The engine (reducer)
// reads this to know prices, rents, card effects, and tile layout.
//
// Economy note: prices and rents use authentic Monopoly proportions scaled
// ~1000x into Naira, so the game stays balanced. Retheme freely; keep the
// relative numbers and the economy still works.
// =============================================================================

// ----------------------------- Types ----------------------------------------

export type ColorGroup =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkblue";

export type TileType =
  | "go"
  | "property"
  | "airport" // equivalent of railroads
  | "utility"
  | "tax"
  | "chance"
  | "esusu" // equivalent of community chest (esusu = communal savings)
  | "jail" // "just visiting" / in jail
  | "free" // free parking
  | "gotojail";

interface BaseTile {
  pos: number; // 0–39, position on the board
  type: TileType;
  name: string;
}

export interface PropertyTile extends BaseTile {
  type: "property";
  group: ColorGroup;
  price: number;
  // rent[0] = base (no houses). rent[1..4] = 1–4 houses. rent[5] = hotel.
  // Engine should DOUBLE rent[0] when owner holds the full color group unimproved.
  rent: [number, number, number, number, number, number];
  houseCost: number; // cost per house; a hotel = 5th "house" at same cost
  mortgage: number;
}

export interface AirportTile extends BaseTile {
  type: "airport";
  price: number;
  // Rent by number of airports the owner holds: 1,2,3,4 -> rent[count-1]
  rent: [number, number, number, number];
  mortgage: number;
}

export interface UtilityTile extends BaseTile {
  type: "utility";
  price: number;
  // Rent = diceTotal * multiplier[ownedCount-1] (4x if own one, 10x if own both)
  multiplier: [number, number];
  mortgage: number;
}

export interface TaxTile extends BaseTile {
  type: "tax";
  amount: number;
}

export type Tile =
  | (BaseTile & { type: "go" | "chance" | "esusu" | "jail" | "free" | "gotojail" })
  | PropertyTile
  | AirportTile
  | UtilityTile
  | TaxTile;

// Card effects the engine knows how to apply.
export type CardAction =
  | { kind: "money"; amount: number } // +/- to current player
  | { kind: "moveTo"; pos: number; collectIfPass?: boolean }
  | { kind: "moveRelative"; steps: number }
  | { kind: "goToJail" }
  | { kind: "getOutOfJailFree" } // player keeps the card
  | { kind: "collectFromEach"; amount: number }
  | { kind: "payEach"; amount: number }
  | { kind: "repairs"; perHouse: number; perHotel: number }
  | { kind: "nearestAirport" } // advance to next airport; rent payable is 2x
  | { kind: "nearestUtility" }; // advance to next utility

export interface Card {
  id: string;
  text: string;
  action: CardAction;
}

// ----------------------------- Constants ------------------------------------

export const STARTING_CASH = 1_500_000;
export const GO_SALARY = 200_000;
export const JAIL_POSITION = 10;
export const JAIL_FINE = 50_000;
export const MAX_HOUSES = 4; // 5th build = hotel
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;

export const formatNaira = (n: number): string =>
  "₦" + Math.round(n).toLocaleString("en-NG");

// ----------------------------- The Board -------------------------------------
// 40 tiles, clockwise from START. Property positions mirror Monopoly's layout
// so the rent proportions stay balanced.

export const BOARD: Tile[] = [
  { pos: 0, type: "go", name: "START" },

  { pos: 1, type: "property", name: "Ajegunle", group: "brown",
    price: 60_000, rent: [2_000, 10_000, 30_000, 90_000, 160_000, 250_000],
    houseCost: 50_000, mortgage: 30_000 },

  { pos: 2, type: "esusu", name: "Esusu Box" },

  { pos: 3, type: "property", name: "Mushin", group: "brown",
    price: 60_000, rent: [4_000, 20_000, 60_000, 180_000, 320_000, 450_000],
    houseCost: 50_000, mortgage: 30_000 },

  { pos: 4, type: "tax", name: "FIRS Income Tax", amount: 200_000 },

  { pos: 5, type: "airport", name: "Murtala Muhammed Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  { pos: 6, type: "property", name: "Oshodi", group: "lightblue",
    price: 100_000, rent: [6_000, 30_000, 90_000, 270_000, 400_000, 550_000],
    houseCost: 50_000, mortgage: 50_000 },

  { pos: 7, type: "chance", name: "Chance" },

  { pos: 8, type: "property", name: "Yaba", group: "lightblue",
    price: 100_000, rent: [6_000, 30_000, 90_000, 270_000, 400_000, 550_000],
    houseCost: 50_000, mortgage: 50_000 },

  { pos: 9, type: "property", name: "Surulere", group: "lightblue",
    price: 120_000, rent: [8_000, 40_000, 100_000, 300_000, 450_000, 600_000],
    houseCost: 50_000, mortgage: 60_000 },

  { pos: 10, type: "jail", name: "Kirikiri Prison (Just Visiting)" },

  { pos: 11, type: "property", name: "Aba", group: "pink",
    price: 140_000, rent: [10_000, 50_000, 150_000, 450_000, 625_000, 750_000],
    houseCost: 100_000, mortgage: 70_000 },

  { pos: 12, type: "utility", name: "PHCN Electric", price: 150_000,
    multiplier: [4, 10], mortgage: 75_000 },

  { pos: 13, type: "property", name: "Onitsha", group: "pink",
    price: 140_000, rent: [10_000, 50_000, 150_000, 450_000, 625_000, 750_000],
    houseCost: 100_000, mortgage: 70_000 },

  { pos: 14, type: "property", name: "Enugu", group: "pink",
    price: 160_000, rent: [12_000, 60_000, 180_000, 500_000, 700_000, 900_000],
    houseCost: 100_000, mortgage: 80_000 },

  { pos: 15, type: "airport", name: "Nnamdi Azikiwe Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  { pos: 16, type: "property", name: "Benin City", group: "orange",
    price: 180_000, rent: [14_000, 70_000, 200_000, 550_000, 750_000, 950_000],
    houseCost: 100_000, mortgage: 90_000 },

  { pos: 17, type: "esusu", name: "Esusu Box" },

  { pos: 18, type: "property", name: "Calabar", group: "orange",
    price: 180_000, rent: [14_000, 70_000, 200_000, 550_000, 750_000, 950_000],
    houseCost: 100_000, mortgage: 90_000 },

  { pos: 19, type: "property", name: "Port Harcourt", group: "orange",
    price: 200_000, rent: [16_000, 80_000, 220_000, 600_000, 800_000, 1_000_000],
    houseCost: 100_000, mortgage: 100_000 },

  { pos: 20, type: "free", name: "Bukka Rest Stop (Free Parking)" },

  { pos: 21, type: "property", name: "Ikeja", group: "red",
    price: 220_000, rent: [18_000, 90_000, 250_000, 700_000, 875_000, 1_050_000],
    houseCost: 150_000, mortgage: 110_000 },

  { pos: 22, type: "chance", name: "Chance" },

  { pos: 23, type: "property", name: "Garki, Abuja", group: "red",
    price: 220_000, rent: [18_000, 90_000, 250_000, 700_000, 875_000, 1_050_000],
    houseCost: 150_000, mortgage: 110_000 },

  { pos: 24, type: "property", name: "Wuse, Abuja", group: "red",
    price: 240_000, rent: [20_000, 100_000, 300_000, 750_000, 925_000, 1_100_000],
    houseCost: 150_000, mortgage: 120_000 },

  { pos: 25, type: "airport", name: "Port Harcourt Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  { pos: 26, type: "property", name: "Jabi, Abuja", group: "yellow",
    price: 260_000, rent: [22_000, 110_000, 330_000, 800_000, 975_000, 1_150_000],
    houseCost: 150_000, mortgage: 130_000 },

  { pos: 27, type: "property", name: "GRA Ikeja", group: "yellow",
    price: 260_000, rent: [22_000, 110_000, 330_000, 800_000, 975_000, 1_150_000],
    houseCost: 150_000, mortgage: 130_000 },

  { pos: 28, type: "utility", name: "Lagos Water Corporation", price: 150_000,
    multiplier: [4, 10], mortgage: 75_000 },

  { pos: 29, type: "property", name: "Asokoro, Abuja", group: "yellow",
    price: 280_000, rent: [24_000, 120_000, 360_000, 850_000, 1_025_000, 1_200_000],
    houseCost: 150_000, mortgage: 140_000 },

  { pos: 30, type: "gotojail", name: "Go to Kirikiri Prison" },

  { pos: 31, type: "property", name: "Victoria Island", group: "green",
    price: 300_000, rent: [26_000, 130_000, 390_000, 900_000, 1_100_000, 1_275_000],
    houseCost: 200_000, mortgage: 150_000 },

  { pos: 32, type: "property", name: "Lekki Phase 1", group: "green",
    price: 300_000, rent: [26_000, 130_000, 390_000, 900_000, 1_100_000, 1_275_000],
    houseCost: 200_000, mortgage: 150_000 },

  { pos: 33, type: "esusu", name: "Esusu Box" },

  { pos: 34, type: "property", name: "Maitama, Abuja", group: "green",
    price: 320_000, rent: [28_000, 150_000, 450_000, 1_000_000, 1_200_000, 1_400_000],
    houseCost: 200_000, mortgage: 160_000 },

  { pos: 35, type: "airport", name: "Mallam Aminu Kano Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  { pos: 36, type: "chance", name: "Chance" },

  { pos: 37, type: "property", name: "Ikoyi", group: "darkblue",
    price: 350_000, rent: [35_000, 175_000, 500_000, 1_100_000, 1_300_000, 1_500_000],
    houseCost: 200_000, mortgage: 175_000 },

  { pos: 38, type: "tax", name: "Customs Duty", amount: 100_000 },

  { pos: 39, type: "property", name: "Banana Island", group: "darkblue",
    price: 400_000, rent: [50_000, 200_000, 600_000, 1_400_000, 1_700_000, 2_000_000],
    houseCost: 200_000, mortgage: 200_000 },
];

// Convenience: how many tiles of each type exist where count matters.
export const AIRPORT_COUNT = BOARD.filter((t) => t.type === "airport").length; // 4
export const UTILITY_COUNT = BOARD.filter((t) => t.type === "utility").length; // 2

// ----------------------------- Card Decks ------------------------------------
// Shuffle these at game start. "getOutOfJailFree" cards are removed from the
// deck while a player holds them, then returned when used.

export const CHANCE_CARDS: Card[] = [
  { id: "ch01", text: "Waka go START. Collect ₦200,000.",
    action: { kind: "moveTo", pos: 0, collectIfPass: true } },
  { id: "ch02", text: "NEPA don bring light after 3 weeks. Collect ₦50,000 refund.",
    action: { kind: "money", amount: 50_000 } },
  { id: "ch03", text: "Danfo conductor no give you correct change. Pay ₦20,000.",
    action: { kind: "money", amount: -20_000 } },
  { id: "ch04", text: "You don hammer federal contract! Waka go Banana Island.",
    action: { kind: "moveTo", pos: 39, collectIfPass: true } },
  { id: "ch05", text: "LASTMA catch you for one-way. Go Kirikiri Prison sharp sharp.",
    action: { kind: "goToJail" } },
  { id: "ch06", text: "Fuel scarcity don land! Pay ₦100,000 make your tank full.",
    action: { kind: "money", amount: -100_000 } },
  { id: "ch07", text: "Your lawyer don settle am. Comot from Jail Free.",
    action: { kind: "getOutOfJailFree" } },
  { id: "ch08", text: "Generator don knock. Service am: pay ₦40,000 per house, ₦115,000 per hotel.",
    action: { kind: "repairs", perHouse: 40_000, perHotel: 115_000 } },
  { id: "ch09", text: "Enter flight. Waka go the nearest airport; if person own am, pay double.",
    action: { kind: "nearestAirport" } },
  { id: "ch10", text: "You don win baba ijebu! Collect ₦150,000.",
    action: { kind: "money", amount: 150_000 } },
  { id: "ch11", text: "Your people for abroad don send money. Collect ₦100,000.",
    action: { kind: "money", amount: 100_000 } },
  { id: "ch12", text: "Waka back 3 spaces.",
    action: { kind: "moveRelative", steps: -3 } },
  { id: "ch13", text: "You dey go Abuja. Waka go Nnamdi Azikiwe Airport.",
    action: { kind: "moveTo", pos: 15, collectIfPass: true } },
  { id: "ch14", text: "Customs don hold your container. Pay ₦75,000.",
    action: { kind: "money", amount: -75_000 } },
  { id: "ch15", text: "Na your birthday! Collect ₦20,000 from every player.",
    action: { kind: "collectFromEach", amount: 20_000 } },
  { id: "ch16", text: "Dem wan check your light bill. Waka go the nearest utility.",
    action: { kind: "nearestUtility" } },
];

export const ESUSU_CARDS: Card[] = [
  { id: "es01", text: "Your esusu don mature. Collect ₦200,000.",
    action: { kind: "money", amount: 200_000 } },
  { id: "es02", text: "Hospital bill for private clinic. Pay ₦100,000.",
    action: { kind: "money", amount: -100_000 } },
  { id: "es03", text: "You win raffle for village meeting. Collect ₦50,000.",
    action: { kind: "money", amount: 50_000 } },
  { id: "es04", text: "School fees don reach. Pay ₦50,000.",
    action: { kind: "money", amount: -50_000 } },
  { id: "es05", text: "Bank make mistake for your favour. Collect ₦150,000.",
    action: { kind: "money", amount: 150_000 } },
  { id: "es06", text: "Owambe aso-ebi money. Pay ₦30,000.",
    action: { kind: "money", amount: -30_000 } },
  { id: "es07", text: "Community elder talk for you. Comot from Jail Free.",
    action: { kind: "getOutOfJailFree" } },
  { id: "es08", text: "Waka go START. Collect ₦200,000.",
    action: { kind: "moveTo", pos: 0, collectIfPass: true } },
  { id: "es09", text: "Your POS business hammer this month. Collect ₦100,000.",
    action: { kind: "money", amount: 100_000 } },
  { id: "es10", text: "NEPA estimated bill don land. Pay ₦40,000.",
    action: { kind: "money", amount: -40_000 } },
  { id: "es11", text: "Inheritance: family land for village. Collect ₦100,000.",
    action: { kind: "money", amount: 100_000 } },
  { id: "es12", text: "Community development levy: pay ₦40,000 per house, ₦115,000 per hotel.",
    action: { kind: "repairs", perHouse: 40_000, perHotel: 115_000 } },
  { id: "es13", text: "Wedding contribution. Give every player ₦20,000.",
    action: { kind: "payEach", amount: 20_000 } },
  { id: "es14", text: "FIRS don refund your tax. Collect ₦20,000.",
    action: { kind: "money", amount: 20_000 } },
  { id: "es15", text: "Tax wahala don catch you. Go Kirikiri Prison.",
    action: { kind: "goToJail" } },
  { id: "es16", text: "Your fixed deposit don mature. Collect ₦25,000.",
    action: { kind: "money", amount: 25_000 } },
];
