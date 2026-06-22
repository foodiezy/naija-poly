// Dev-only design harness: renders the GameBoard with mock state so the visual
// design can be iterated without a running game server. Served at /preview.html
// by Vite in dev. Not part of the production app.
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import GameBoard from "./components/GameBoard";
import { BOARD } from "../data/board";
import { TOKENS } from "../data/tokens";
import "./index.css";

const players = [
  { id: "p1", name: "Chidi", cash: 1_240_000 },
  { id: "p2", name: "Amina", cash: 980_000 },
  { id: "p3", name: "Emeka", cash: 1_510_000 },
  { id: "p4", name: "Bola", cash: 320_000 },
].map((p, i) => ({
  ...p,
  position: [0, 12, 24, 31][i],
  inJail: false,
  jailTurns: 0,
  getOutOfJailCards: 0,
  bankrupt: false,
  order: i,
}));

// Assign owners + development across the board so every group colour, houses,
// hotels, and mortgaged states are visible at once.
const tiles: Record<number, { ownerId: string | null; houses: number; mortgaged: boolean }> = {};
let n = 0;
for (const tile of BOARD) {
  if ("price" in tile) {
    const owner = players[n % players.length].id;
    const houses = tile.type === "property" ? [0, 1, 2, 5, 0, 3][n % 6] : 0;
    const mortgaged = n % 7 === 5;
    tiles[tile.pos] = { ownerId: owner, houses: mortgaged ? 0 : houses, mortgaged };
    n++;
  }
}

const engineState = {
  players,
  currentPlayerIndex: 0,
  tiles,
  phase: "awaiting-roll",
  dice: [4, 3] as [number, number],
  doublesCount: 0,
  chanceOrder: [],
  esusuOrder: [],
  chancePtr: 0,
  esusuPtr: 0,
  log: [
    "--- Round 4 ---",
    "Chidi rolled 4 + 3 = 7.",
    "Chidi bought Lekki Phase 1 for ₦350,000!",
    "Amina paid ₦85,000 rent to Emeka.",
    "Bola drew Esusu: \"Village meeting levy — pay ₦40,000.\"",
  ],
  winnerId: null,
  settings: { startingCash: 1_500_000, turnLimit: 0, freeParkingJackpot: false },
  currentTurn: 4,
  freeParkingPot: 0,
};

const lobbyPlayers = new Map(
  players.map((p, i) => [p.id, { name: p.name, tokenId: TOKENS[i].id }]),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
      <div className="board-panel">
        <GameBoard
          engineState={engineState}
          roomState={{ lobbyPlayers }}
          mySessionId="p1"
          onTileClick={() => {}}
        />
      </div>
    </div>
  </MotionConfig>,
);
