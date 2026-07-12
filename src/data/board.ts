// =============================================================================
// board.ts — Pan-Nigerian themed board for a property-trading board game
// -----------------------------------------------------------------------------
// This is PURE DATA + TYPES. No game logic lives here. The engine (reducer)
// reads this to know prices, rents, card effects, and tile layout.
//
// Theming intent: the board represents ALL of Nigeria, not just Lagos. Eight
// zones (Borno, Kwara, Enugu, Kaduna, Edo, Rivers, Abuja, Lagos) cover
// North, Middle Belt, East, West, South, capital, and economic hubs so
// every player feels seen. Card flavour uses Pidgin and national-scale
// references (EFCC, CBN, NAFDAC, OPay, Kirikiri, "show boys love") rather
// than regional language.
//
// Economy note: prices and rents use authentic Monopoly proportions scaled
// ~1000x into Naira, so the game stays balanced. Retheme freely; keep the
// relative numbers and the economy still works.
// =============================================================================

// ----------------------------- Types ----------------------------------------

// Color group ids. Their *names* are legacy (kept stable so existing CSS
// custom-properties --color-brown ... --color-darkblue continue to work),
// but the *meaning* maps to Nigerian zones in ascending price order:
//   brown     = Borno
//   lightblue = Kwara
//   pink      = Enugu
//   orange    = Kaduna
//   red       = Edo
//   yellow    = Rivers
//   green     = Abuja
//   darkblue  = Lagos
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
  | "hustle" // community chest, renamed for nationwide-Nigerian feel
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
  | (BaseTile & { type: "go" | "chance" | "hustle" | "jail" | "free" | "gotojail" })
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
  | { kind: "nearestUtility" } // advance to next utility
  | { kind: "blackout" } // chaos mode: NEPA takes light — no rent for a round
  | { kind: "airportStrike" } // chaos mode: no airport rent for a round
  | { kind: "propertyBonus"; perHouse: number; perHotel: number }; // chaos mode: market boom

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
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;

export const formatNaira = (n: number): string =>
  "₦" + Math.round(n).toLocaleString("en-NG");

// ----------------------------- Auctions --------------------------------------
// Auctions are open-outcry, fixed-increment, and timed. Each bid window lasts
// this long and is reset on every new bid (the server owns the clock).
export const AUCTION_BID_DURATION_MS = 12_000;

// Derive the set of legal raise amounts from the tile's price so a ₦400k tile
// auctions as briskly as a ₦60k one. Base step ≈ 10% of price, floored at ₦10k
// and rounded to a clean ₦10k figure; buttons offer 1×, 2×, and 5× that step.
export const auctionIncrements = (
  price: number,
): { minIncrement: number; bidIncrements: number[] } => {
  const base = Math.max(10_000, Math.round(price / 100_000) * 10_000);
  return { minIncrement: base, bidIncrements: [base, base * 2, base * 5] };
};

// ----------------------------- The Board -------------------------------------
// 40 tiles, clockwise from START. Property positions mirror Monopoly's layout
// so the rent proportions stay balanced. Zone layout (cheapest → priciest):
//   Borno → Kwara → Enugu → Kaduna → Edo → Rivers → Abuja → Lagos.

export const BOARD: Tile[] = [
  { pos: 0, type: "go", name: "START" },

  // ── Borno (₦60k tier) ────────────────────────────────────────────────
  { pos: 1, type: "property", name: "Maiduguri", group: "brown",
    price: 60_000, rent: [2_000, 10_000, 30_000, 90_000, 160_000, 250_000],
    houseCost: 50_000, mortgage: 30_000 },

  { pos: 2, type: "hustle", name: "Hustle Box" },

  { pos: 3, type: "property", name: "Bama", group: "brown",
    price: 60_000, rent: [4_000, 20_000, 60_000, 180_000, 320_000, 450_000],
    houseCost: 50_000, mortgage: 30_000 },

  { pos: 4, type: "tax", name: "FIRS Income Tax", amount: 200_000 },

  { pos: 5, type: "airport", name: "Murtala Muhammed Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  // ── Kwara (₦100–120k tier) ───────────────────────────────────────────
  { pos: 6, type: "property", name: "Ilorin", group: "lightblue",
    price: 100_000, rent: [6_000, 30_000, 90_000, 270_000, 400_000, 550_000],
    houseCost: 50_000, mortgage: 50_000 },

  { pos: 7, type: "chance", name: "Chance" },

  { pos: 8, type: "property", name: "Sango", group: "lightblue",
    price: 100_000, rent: [6_000, 30_000, 90_000, 270_000, 400_000, 550_000],
    houseCost: 50_000, mortgage: 50_000 },

  { pos: 9, type: "property", name: "Tanke", group: "lightblue",
    price: 120_000, rent: [8_000, 40_000, 100_000, 300_000, 450_000, 600_000],
    houseCost: 50_000, mortgage: 60_000 },

  { pos: 10, type: "jail", name: "Kirikiri Prison (Just Visiting)" },

  // ── Enugu (₦140–160k tier) ───────────────────────────────────────────
  { pos: 11, type: "property", name: "Enugu", group: "pink",
    price: 140_000, rent: [10_000, 50_000, 150_000, 450_000, 625_000, 750_000],
    houseCost: 100_000, mortgage: 70_000 },

  { pos: 12, type: "utility", name: "NEPA", price: 150_000,
    multiplier: [4, 10], mortgage: 75_000 },

  { pos: 13, type: "property", name: "Udi", group: "pink",
    price: 140_000, rent: [10_000, 50_000, 150_000, 450_000, 625_000, 750_000],
    houseCost: 100_000, mortgage: 70_000 },

  { pos: 14, type: "property", name: "Nsukka", group: "pink",
    price: 160_000, rent: [12_000, 60_000, 180_000, 500_000, 700_000, 900_000],
    houseCost: 100_000, mortgage: 80_000 },

  { pos: 15, type: "airport", name: "Nnamdi Azikiwe Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  // ── Kaduna (₦180–200k tier) ──────────────────────────────────────────
  { pos: 16, type: "property", name: "Kaduna", group: "orange",
    price: 180_000, rent: [14_000, 70_000, 200_000, 550_000, 750_000, 950_000],
    houseCost: 100_000, mortgage: 90_000 },

  { pos: 17, type: "hustle", name: "Hustle Box" },

  { pos: 18, type: "property", name: "Zaria", group: "orange",
    price: 180_000, rent: [14_000, 70_000, 200_000, 550_000, 750_000, 950_000],
    houseCost: 100_000, mortgage: 90_000 },

  { pos: 19, type: "property", name: "Kafanchan", group: "orange",
    price: 200_000, rent: [16_000, 80_000, 220_000, 600_000, 800_000, 1_000_000],
    houseCost: 100_000, mortgage: 100_000 },

  { pos: 20, type: "free", name: "Mama Put Rest Stop (Free Parking)" },

  // ── Edo (₦220–240k tier) ─────────────────────────────────────────────
  { pos: 21, type: "property", name: "Benin City", group: "red",
    price: 220_000, rent: [18_000, 90_000, 250_000, 700_000, 875_000, 1_050_000],
    houseCost: 150_000, mortgage: 110_000 },

  { pos: 22, type: "chance", name: "Chance" },

  { pos: 23, type: "property", name: "Auchi", group: "red",
    price: 220_000, rent: [18_000, 90_000, 250_000, 700_000, 875_000, 1_050_000],
    houseCost: 150_000, mortgage: 110_000 },

  { pos: 24, type: "property", name: "Ekpoma", group: "red",
    price: 240_000, rent: [20_000, 100_000, 300_000, 750_000, 925_000, 1_100_000],
    houseCost: 150_000, mortgage: 120_000 },

  { pos: 25, type: "airport", name: "Port Harcourt Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  // ── Rivers (₦260–280k tier) ──────────────────────────────────────────
  { pos: 26, type: "property", name: "Port Harcourt", group: "yellow",
    price: 260_000, rent: [22_000, 110_000, 330_000, 800_000, 975_000, 1_150_000],
    houseCost: 150_000, mortgage: 130_000 },

  { pos: 27, type: "property", name: "Bonny Island", group: "yellow",
    price: 260_000, rent: [22_000, 110_000, 330_000, 800_000, 975_000, 1_150_000],
    houseCost: 150_000, mortgage: 130_000 },

  { pos: 28, type: "utility", name: "NAFDAC", price: 150_000,
    multiplier: [4, 10], mortgage: 75_000 },

  { pos: 29, type: "property", name: "Oyigbo", group: "yellow",
    price: 280_000, rent: [24_000, 120_000, 360_000, 850_000, 1_025_000, 1_200_000],
    houseCost: 150_000, mortgage: 140_000 },

  { pos: 30, type: "gotojail", name: "Go to Kirikiri Prison" },

  // ── Abuja (₦300–320k tier) ───────────────────────────────────────────
  { pos: 31, type: "property", name: "Maitama, Abuja", group: "green",
    price: 300_000, rent: [26_000, 130_000, 390_000, 900_000, 1_100_000, 1_275_000],
    houseCost: 200_000, mortgage: 150_000 },

  { pos: 32, type: "property", name: "Asokoro, Abuja", group: "green",
    price: 300_000, rent: [26_000, 130_000, 390_000, 900_000, 1_100_000, 1_275_000],
    houseCost: 200_000, mortgage: 150_000 },

  { pos: 33, type: "hustle", name: "Hustle Box" },

  { pos: 34, type: "property", name: "Wuse, Abuja", group: "green",
    price: 320_000, rent: [28_000, 150_000, 450_000, 1_000_000, 1_200_000, 1_400_000],
    houseCost: 200_000, mortgage: 160_000 },

  { pos: 35, type: "airport", name: "Mallam Aminu Kano Airport",
    price: 200_000, rent: [25_000, 50_000, 100_000, 200_000], mortgage: 100_000 },

  { pos: 36, type: "chance", name: "Chance" },

  // ── Lagos (premium tier) ─────────────────────────────────────────────
  { pos: 37, type: "property", name: "Victoria Island", group: "darkblue",
    price: 350_000, rent: [35_000, 175_000, 500_000, 1_100_000, 1_300_000, 1_500_000],
    houseCost: 200_000, mortgage: 175_000 },

  { pos: 38, type: "tax", name: "Customs Duty", amount: 100_000 },

  { pos: 39, type: "property", name: "Ikoyi", group: "darkblue",
    price: 400_000, rent: [50_000, 200_000, 600_000, 1_400_000, 1_700_000, 2_000_000],
    houseCost: 200_000, mortgage: 200_000 },
];

// ----------------------------- Card Decks ------------------------------------
// Shuffle these at game start. "getOutOfJailFree" cards are removed from the
// deck while a player holds them, then returned when used.

export const CHANCE_CARDS: Card[] = [
  { id: "ch01", text: "Waka go START. Collect ₦200,000.",
    action: { kind: "moveTo", pos: 0, collectIfPass: true } },
  { id: "ch02", text: "Opay pay you POS dividend. Collect ₦50,000.",
    action: { kind: "money", amount: 50_000 } },
  { id: "ch03", text: "You don hammer big deal! Waka go Asokoro, Abuja. If you pass START, collect ₦200,000.",
    action: { kind: "moveTo", pos: 32, collectIfPass: true } },
  { id: "ch04", text: "Federal contract don land! Waka go Ikoyi. If you pass START, collect ₦200,000.",
    action: { kind: "moveTo", pos: 39, collectIfPass: true } },
  { id: "ch05", text: "Carry go Benin City. If you pass START, collect ₦200,000.",
    action: { kind: "moveTo", pos: 21, collectIfPass: true } },
  { id: "ch06", text: "Coal City dey call. Waka go Enugu. If you pass START, collect ₦200,000.",
    action: { kind: "moveTo", pos: 11, collectIfPass: true } },
  { id: "ch07", text: "Your lawyer don settle am. Comot from Jail Free.",
    action: { kind: "getOutOfJailFree" } },
  { id: "ch08", text: "Rainy season don land, make general repairs: pay ₦40,000 per Bungalow/Duplex/Mansion/Mini-Estate, ₦115,000 per Hotel.",
    action: { kind: "repairs", perHouse: 40_000, perHotel: 115_000 } },
  { id: "ch09", text: "Enter flight. Waka go the nearest airport; if person own am, pay double.",
    action: { kind: "nearestAirport" } },
  { id: "ch10", text: "Waka back 3 spaces.",
    action: { kind: "moveRelative", steps: -3 } },
  { id: "ch11", text: "EFCC don catch you! Go Kirikiri Prison straight. No collect ₦200,000.",
    action: { kind: "goToJail" } },
  { id: "ch12", text: "Something for the boys! Police flog you for over-speeding. Pay ₦20,000.",
    action: { kind: "money", amount: -20_000 } },
  { id: "ch13", text: "You dey go Abuja. Waka go Nnamdi Azikiwe Airport. If you pass START, collect ₦200,000.",
    action: { kind: "moveTo", pos: 15, collectIfPass: true } },
  { id: "ch14", text: "Dem elect you for House of Reps. Show the boys love: pay every player ₦50,000.",
    action: { kind: "payEach", amount: 50_000 } },
  { id: "ch15", text: "Your building loan don mature. Collect ₦150,000.",
    action: { kind: "money", amount: 150_000 } },
  { id: "ch16", text: "Dem wan check your light bill. Waka go the nearest utility; throw dice, pay owner ten times wetin you throw.",
    action: { kind: "nearestUtility" } },
];

export const HUSTLE_CARDS: Card[] = [
  { id: "hs01", text: "Waka go START. Collect ₦200,000.",
    action: { kind: "moveTo", pos: 0, collectIfPass: true } },
  { id: "hs02", text: "Bank error for your favour! Collect ₦200,000.",
    action: { kind: "money", amount: 200_000 } },
  { id: "hs03", text: "Doctor bill. Pay ₦50,000.",
    action: { kind: "money", amount: -50_000 } },
  { id: "hs04", text: "You sell your shares for NGX. Collect ₦50,000.",
    action: { kind: "money", amount: 50_000 } },
  { id: "hs05", text: "EFCC freeze your account. Go Kirikiri Prison. No collect ₦200,000.",
    action: { kind: "goToJail" } },
  { id: "hs06", text: "Your holiday savings don mature. Collect ₦100,000.",
    action: { kind: "money", amount: 100_000 } },
  { id: "hs07", text: "Community elder talk for you. Comot from Jail Free.",
    action: { kind: "getOutOfJailFree" } },
  { id: "hs08", text: "FIRS don refund your tax. Collect ₦20,000.",
    action: { kind: "money", amount: 20_000 } },
  { id: "hs09", text: "Na your birthday! Collect ₦10,000 from every player. BOZZAAA!",
    action: { kind: "collectFromEach", amount: 10_000 } },
  { id: "hs10", text: "Your life insurance policy don mature. Collect ₦100,000.",
    action: { kind: "money", amount: 100_000 } },
  { id: "hs11", text: "Mosquito don bite you! Hospital bill ₦100,000.",
    action: { kind: "money", amount: -100_000 } },
  { id: "hs12", text: "School fees don reach. Pay ₦50,000.",
    action: { kind: "money", amount: -50_000 } },
  { id: "hs13", text: "You collect consultancy fee. Receive ₦25,000.",
    action: { kind: "money", amount: 25_000 } },
  { id: "hs14", text: "Government assess you for street repair: pay ₦40,000 per Bungalow/Duplex/Mansion/Mini-Estate, ₦115,000 per Hotel.",
    action: { kind: "repairs", perHouse: 40_000, perHotel: 115_000 } },
  { id: "hs15", text: "You win second prize for beauty pageant — see as you dey shine! Collect ₦10,000.",
    action: { kind: "money", amount: 10_000 } },
  { id: "hs16", text: "Inheritance: family land for village. Collect ₦100,000.",
    action: { kind: "money", amount: 100_000 } },
];

// Chaos-mode cards. Only shuffled into the deck when the host enables Chaos
// Mode; kept separate so the base game stays predictable. Mixed into the Chance
// deck. drawCard looks cards up in ALL_CHANCE_CARDS so these resolve either way.
export const CHAOS_CHANCE_CARDS: Card[] = [
  { id: "cx01", text: "⚡ NEPA don take light! Total blackout — nobody fit collect rent until the round waka back around.",
    action: { kind: "blackout" } },
  { id: "cx02", text: "⛽ Fuel Scarcity! Waka back 3 spaces and you no fit move quick.",
    action: { kind: "moveRelative", steps: -3 } },
  { id: "cx03", text: "📈 Market Boom! Collect ₦20,000 per house and ₦100,000 per hotel you own.",
    action: { kind: "propertyBonus", perHouse: 20_000, perHotel: 100_000 } },
  { id: "cx04", text: "🎉 Owambe Expenses! You spray money for party: pay each player ₦20,000.",
    action: { kind: "payEach", amount: 20_000 } },
  { id: "cx05", text: "💻 Bank Network Failure! Transfer hang, you lose ₦50,000.",
    action: { kind: "money", amount: -50_000 } },
  { id: "cx06", text: "🚧 Area Boys Levy! Settle the boys on your street. Pay ₦30,000.",
    action: { kind: "money", amount: -30_000 } },
  { id: "cx07", text: "📝 Election Contract! Your candidate win, collect ₦30,000 from each player.",
    action: { kind: "collectFromEach", amount: 30_000 } },
  { id: "cx08", text: "❄️ Rent Freeze! Government say no landlord fit collect rent until next round.",
    action: { kind: "blackout" } }, // re-uses blackout mechanic
  { id: "cx09", text: "✈️ Airport Strike! Aviation workers don lock gate. No airport rent collected until next round.",
    action: { kind: "airportStrike" } },
];

// Every card the Chance deck can draw, base + chaos, for id lookups.
export const ALL_CHANCE_CARDS: Card[] = [...CHANCE_CARDS, ...CHAOS_CHANCE_CARDS];
