export const GAME_GUIDE_SEEN_KEY = "odogwu-tutorial-seen";

type GuideStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): GuideStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function hasSeenGameGuide(storage = browserStorage()): boolean {
  try {
    return storage?.getItem(GAME_GUIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGameGuideSeen(storage = browserStorage()): void {
  try {
    storage?.setItem(GAME_GUIDE_SEEN_KEY, "1");
  } catch {
    // Storage can be blocked in private browsing; the guide still works.
  }
}

export const GAME_GUIDE = [
  {
    id: "token",
    emoji: "🚗",
    title: "Pick your token — that's you",
    desc: "Choose your playing piece in the room. It shows where you are on the board and moves whenever you roll.",
  },
  {
    id: "turn",
    emoji: "🎲",
    title: "Follow the big button on your turn",
    desc: "The large button at the bottom always shows your next move: roll, buy, start an auction, settle debt, or end your turn. Doubles give you another roll.",
  },
  {
    id: "property",
    emoji: "🏘️",
    title: "Buy land and collect rent",
    desc: "Buy an unowned property when you land on it. If you pass, everyone can bid in an auction. Rent is paid automatically when another player lands on your property.",
  },
  {
    id: "build",
    emoji: "🏗️",
    title: "Complete a colour group, then build",
    desc: "Own every property in one colour to unlock buildings. Open the property deed to add Bungalows, Duplexes, Mansions, and Hotels for much higher rent.",
  },
  {
    id: "trade",
    emoji: "🤝",
    title: "Trade to complete your empire",
    desc: "Use Trade to offer cash, unimproved properties, or jail cards. The other player can accept, reject, or send a counter-offer.",
  },
  {
    id: "debt",
    emoji: "🏦",
    title: "Short of cash? Raise money first",
    desc: "Sell buildings, mortgage property, or make a trade to pay what you owe. Declare bankruptcy only when you cannot recover.",
  },
  {
    id: "special",
    emoji: "🔒",
    title: "Cards, Mama Put, and Kirikiri",
    desc: "Chance and Hustle cards can help or punish you. Taxes feed the Mama Put pot when that option is on. In jail, roll doubles, pay the fine, or use a jail card.",
  },
  {
    id: "win",
    emoji: "🏆",
    title: "Be the last player standing",
    desc: "Build strong colour groups, collect rent, and survive every debt. The last player who is not bankrupt becomes the Odogwu.",
  },
] as const;
