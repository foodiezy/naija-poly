// Dev-only design harness: renders the full Game view with mock state so the visual
// design can be iterated without a running game server. Served at /preview.html
// by Vite in dev. Not part of the production app.
import { useState } from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import GameBoard from "./components/GameBoard";
import ControlPanel from "./components/ControlPanel";
import AssetsPanel from "./components/AssetsPanel";
import ChatPanel from "./components/ChatPanel";
import SettingsPanel from "./components/SettingsPanel";
import TileInspector from "./components/TileInspector";
import { BOARD } from "../data/board";
import { TOKENS } from "../data/tokens";
import { RoomState } from "../shared/room";
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
  phase: "awaiting-roll" as const,
  dice: [4, 3] as [number, number],
  doublesCount: 0,
  chanceOrder: [],
  hustleOrder: [],
  chancePtr: 0,
  hustlePtr: 0,
  log: [
    "--- Round 4 ---",
    "Chidi rolled 4 + 3 = 7.",
    "Chidi bought Asokoro, Abuja for ₦300,000!",
    "Amina paid ₦85,000 rent to Emeka.",
    "Bola drew Hustle: \"Village meeting levy — pay ₦40,000.\"",
  ],
  winnerId: null,
  settings: { startingCash: 1_500_000, turnLimit: 0, freeParkingJackpot: false },
  currentTurn: 4,
  freeParkingPot: 0,
  activeTrade: null,
};

const lobbyPlayers = new Map(
  players.map((p, i) => [p.id, { id: p.id, name: p.name, tokenId: TOKENS[i].id }]),
);

const roomState: RoomState = {
  status: "in_progress",
  lobbyPlayers,
  hostId: "p1",
  gameStateJson: "",
  startingCash: 1_500_000,
  turnLimit: 0,
  freeParkingJackpot: false,
  turnTimerEnabled: false,
  turnTimeoutSecs: 120,
  turnDeadline: 0,
};

function PreviewApp() {
  const [muted, setMuted] = useState(false);
  const [autoEndTurn, setAutoEndTurn] = useState(true);
  const [selectedTilePos, setSelectedTilePos] = useState<number | null>(null);
  const mockRoom = { sessionId: "p1", state: roomState } as any;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-container">
            <span className="logo-text">Odogwu Empire (Design Preview)</span>
          </div>
        </div>
        <div className="header-center">
          <span className="header-tagline">Buy the land. Become the Odogwu.</span>
          <span className="header-badge">✨ Premium Unicons & Property Manager Active</span>
        </div>
        <div className="header-right">
          <button className="header-btn header-btn-outline" onClick={() => setMuted(!muted)}>
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <div className="game-view" style={{ opacity: 1 }}>
        <div className="game-col game-col-left">
          <ChatPanel
            room={mockRoom}
            engineState={engineState as any}
            chatMessages={[{ senderId: "System", senderName: "System", text: "Welcome to Odogwu Empire Preview!", tokenId: "agbada", timestamp: Date.now(), toId: "all" }]}
            onSendChatMessage={() => {}}
          />
          <SettingsPanel muted={muted} onToggleMute={() => setMuted(!muted)} />
        </div>

        <div className="board-panel">
          <GameBoard
            engineState={engineState as any}
            roomState={roomState}
            mySessionId="p1"
            onTileClick={(pos) => setSelectedTilePos(pos)}
          />
        </div>

        <div className="game-col game-col-right">
          <ControlPanel
            room={mockRoom}
            engineState={engineState as any}
            onSendAction={(action) => console.log("Action dispatched in preview:", action)}
            autoEndTurn={autoEndTurn}
            onToggleAutoEndTurn={() => setAutoEndTurn(!autoEndTurn)}
          />
          <AssetsPanel
            room={mockRoom}
            engineState={engineState as any}
          />
        </div>
      </div>

      <AnimatePresence>
        {selectedTilePos !== null && (
          <TileInspector
            tilePos={selectedTilePos}
            engineState={engineState as any}
            roomState={roomState}
            onClose={() => setSelectedTilePos(null)}
          />
        )}
      </AnimatePresence>

      <footer className="app-footer">
        <div className="footer-left">
          <span className="footer-logo">🏛️ Odogwu Empire</span>
          <span>How to Play</span>
          <span>Privacy</span>
        </div>
        <div className="footer-right">
          © 2026 Odogwu Games · Made with Lagos vibes.
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <PreviewApp />
  </MotionConfig>
);
