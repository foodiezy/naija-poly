import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BOARD, Tile, PropertyTile } from "../../data/board";
import { getDevelopmentName, getRent } from "../../engine/engine";
import { tokenEmoji } from "../../data/tokens";
import { GameState, Player } from "../../engine/types";
import { RoomState } from "../../shared/room";
import TileImage from "./TileImage";
import { tileImageUrl } from "../tileImages";
import { IconHouse, IconHotel } from "./icons";
import { useTriviaRotation } from "../hooks/useTriviaRotation";

// Shorter label for the cramped board tile. The ✈/⚡/📡 icon already conveys the
// type, so drop the redundant "Airport"/"Corporation" suffix; the full name
// still shows in the deed inspector.
function boardLabel(tile: Tile): string {
  if (tile.type === "airport") return tile.name.replace(/\s*Airport$/i, "");
  if (tile.type === "utility") return tile.name.replace(/\s*Corporation$/i, "");
  return tile.name;
}

interface GameBoardProps {
  engineState: GameState;
  roomState: RoomState | null;
  mySessionId?: string;
  onTileClick?: (pos: number) => void;
  onEndTurn?: () => void;
  onRoll?: () => void;
  // Animated token positions from the shared walker (owned by App so the buy
  // card can wait for the token to arrive). Falls back to static positions.
  displayedPositions?: Map<string, number>;
}

// Which edge a tile sits on — determines color-bar side
function getTileEdge(pos: number): "bottom" | "left" | "top" | "right" {
  if (pos <= 10) return "bottom";
  if (pos <= 20) return "left";
  if (pos <= 30) return "top";
  return "right";
}

// Color bar is always on the board-center-facing side of the tile
function getColorBarStyle(pos: number): React.CSSProperties {
  // bottom row: bar on top (facing center)
  if (pos <= 10)
    return {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "11px",
      width: "auto",
      borderRadius: "2px 2px 0 0",
    };
  // left col: bar on right (facing center)
  if (pos <= 20)
    return {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "11px",
      height: "auto",
      borderRadius: "0 2px 2px 0",
    };
  // top row: bar on bottom (facing center)
  if (pos <= 30)
    return {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "11px",
      width: "auto",
      borderRadius: "0 0 2px 2px",
    };
  // right col: bar on left (facing center)
  return {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "11px",
    height: "auto",
    borderRadius: "2px 0 0 2px",
  };
}

// Padding on tile content to clear the absolutely-positioned color bar
function getColorBarPadding(pos: number, hasBar: boolean, isCorner: boolean): React.CSSProperties {
  if (!hasBar || isCorner) return {};
  if (pos <= 10) return { paddingTop: "13px" };
  if (pos <= 20) return { paddingRight: "13px" };
  if (pos <= 30) return { paddingBottom: "13px" };
  return { paddingLeft: "13px" };
}

// Icon for non-property tile types
function getSpecialTileIcon(tile: Tile): string {
  switch (tile.type) {
    case "go":
      return "🚀";
    case "jail":
      return "🔒";
    case "free":
      return "🍲";
    case "gotojail":
      return "👮";
    case "chance":
      return "❓";
    case "hustle":
      return "💼";
    case "airport":
      return "✈️";
    case "utility":
      return tile.name.toLowerCase().includes("power") ||
        tile.name.toLowerCase().includes("nepa") ||
        tile.name.toLowerCase().includes("ecg")
        ? "⚡"
        : "📡";
    default:
      return "";
  }
}

// Map 0-39 board position to 11x11 CSS Grid (1-indexed row/column)
function getTileGridCoords(pos: number): { row: number; col: number } {
  if (pos >= 0 && pos <= 10) {
    // Bottom edge: Go (0) is bottom-right, Jail (10) is bottom-left
    return { row: 11, col: 11 - pos };
  } else if (pos > 10 && pos <= 20) {
    // Left edge: pos 11 is row 10, pos 20 is row 1 (Mama Put Rest Stop)
    return { row: 11 - (pos - 10), col: 1 };
  } else if (pos > 20 && pos <= 30) {
    // Top edge: pos 21 is col 2, pos 30 is col 11 (Go to Jail)
    return { row: 1, col: 1 + (pos - 20) };
  } else {
    // Right edge: pos 31 is row 2, pos 39 is row 10
    return { row: 1 + (pos - 30), col: 11 };
  }
}

export default function GameBoard({
  engineState,
  roomState,
  mySessionId,
  onTileClick,
  onEndTurn,
  onRoll,
  displayedPositions: displayedPositionsProp,
}: GameBoardProps) {
  if (!engineState) {
    return (
      <div className="glass-panel" style={{ padding: "2rem", textAlign: "center" }}>
        <h3>Loading board state...</h3>
      </div>
    );
  }

  // Get active players mapping
  const players = engineState.players || [];
  const tilesState = engineState.tiles || {};
  const lobbyPlayers = roomState?.lobbyPlayers || new Map();

  // App owns the token walker (so the buy card can wait for the token to
  // arrive). Fall back to static positions when it isn't provided (the design
  // preview, which has no motion).
  const displayedPositions =
    displayedPositionsProp ?? new Map(players.map((p) => [p.id, p.position]));
  const getDisplayedPos = (p: Player) => displayedPositions.get(p.id) ?? p.position;

  // Identify the local player's position and the active turn player
  const myPlayer = mySessionId ? players.find((p: Player) => p.id === mySessionId) : null;
  const myPosition = myPlayer ? getDisplayedPos(myPlayer) : -1;
  const activePlayerIndex = engineState.currentPlayerIndex ?? -1;
  const activePlayer = activePlayerIndex >= 0 ? players[activePlayerIndex] : undefined;
  const activePlayerId = activePlayer ? activePlayer.id : null;
  const isMyTurn = activePlayerId === mySessionId;
  // True once the active player's piece has finished walking — used to hold the
  // drawn-card banner until arrival so the token walk isn't spoiled.
  const activeArrived = !activePlayer || getDisplayedPos(activePlayer) === activePlayer.position;

  const logsEndRef = useRef<HTMLDivElement>(null);
  // Whether the drawn-card banner is currently shown (auto-dismisses).
  const [cardVisible, setCardVisible] = useState(false);
  // Shake the dice briefly when a new roll comes in, then settle.
  const [diceShaking, setDiceShaking] = useState(false);
  const prevDiceKey = useRef<string>("");
  // The dice element PERSISTS across rolls (never unmounts) and just spins to
  // its new value. diceSpins accumulates a full extra turn per roll so the spin
  // is always visible — even when the same value is rolled twice.
  const diceSpins = useRef(0);
  const lastDiceSig = useRef<string>("");
  // Latch the board Roll button on click so a double-tap can't fire two ROLLs
  // before the phase flips; released whenever the phase or turn changes.
  const [rollBusy, setRollBusy] = useState(false);

  // In-game trivia rotation — shown during other players' turns
  const boardTrivia = useTriviaRotation(14000, isMyTurn);

  // Keep the game feed pinned to the newest line WITHOUT scrolling the page.
  // scrollIntoView() walks every scrollable ancestor (including the window),
  // so on shorter viewports each new log line yanked the whole page downward.
  // Scroll only the feed's own container instead.
  useEffect(() => {
    const container = logsEndRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [engineState.log?.length]);

  // Trigger dice shake when the dice values change
  useEffect(() => {
    const key = engineState.dice
      ? `${engineState.dice[0]}-${engineState.dice[1]}-${engineState.currentTurn}`
      : "";
    if (key && key !== prevDiceKey.current) {
      prevDiceKey.current = key;
      setDiceShaking(true);
      const t = setTimeout(() => setDiceShaking(false), 380);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [engineState.dice, engineState.currentTurn]);

  const getLogClass = (logLine: string) => {
    if (
      logLine.includes("rolled") ||
      logLine.includes("START") ||
      logLine.includes("Prison") ||
      logLine.includes("escaped")
    ) {
      return "log-entry log-entry-system";
    }
    if (logLine.includes("bought")) {
      return "log-entry log-entry-buy";
    }
    if (logLine.includes("paid rent") || logLine.includes("paid ₦") || logLine.includes("tax")) {
      return "log-entry log-entry-rent";
    }
    return "log-entry";
  };

  const getTokenEmoji = (playerId: string) => tokenEmoji(lobbyPlayers.get(playerId)?.tokenId);

  // Render a die that STAYS mounted (stable key) and simply rotates its cube to
  // the requested value. The `.cube` CSS `transition: transform` animates that
  // rotation, so the die spins to its new face in place instead of vanishing
  // and popping back. `spinTurns` adds full 360° turns for the tumble feel.
  const renderDie3D = (value: number, key: string, spinTurns: number) => {
    let faceX = 0;
    let faceY = 0;
    switch (value) {
      case 6:
        faceX = 180;
        break;
      case 2:
        faceX = -90;
        break;
      case 5:
        faceX = 90;
        break;
      case 3:
        faceY = 90;
        break;
      case 4:
        faceY = -90;
        break;
      case 1:
      default:
        break;
    }
    // Slight isometric resting tilt so the value face plus two side faces show —
    // reads as a real 3D die. Extra full turns per roll drive the visible spin.
    const rotation = `rotateX(${-18 + faceX}deg) rotateY(${22 + faceY + spinTurns * 360}deg)`;

    return (
      <div key={key} className="die-3d-wrapper">
        <div className="die-3d">
          <div className="cube" style={{ transform: rotation }}>
            <div className="face front" data-value="1">
              <span className="pip"></span>
            </div>
            <div className="face back" data-value="6">
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
            </div>
            <div className="face top" data-value="2">
              <span className="pip"></span>
              <span className="pip"></span>
            </div>
            <div className="face bottom" data-value="5">
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
            </div>
            <div className="face left" data-value="3">
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
            </div>
            <div className="face right" data-value="4">
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Helper to extract the last card draw text from logs
  const lastLog =
    engineState.log && engineState.log.length > 0
      ? engineState.log[engineState.log.length - 1]
      : "";
  const cardDrawMatch = lastLog.match(/(.+) drew (Chance|Hustle): "(.+)"/);

  const activeCardDraw = cardDrawMatch
    ? {
        player: cardDrawMatch[1],
        type: cardDrawMatch[2].toLowerCase(),
        text: cardDrawMatch[3],
      }
    : null;

  // Show the drawn-card banner briefly, then auto-dismiss so it stops covering
  // the game feed and doesn't linger until the next log line.
  useEffect(() => {
    if (!cardDrawMatch) {
      setCardVisible(false);
      return;
    }
    // Wait for the drawer's token to land before revealing the card, so the
    // walk animation keeps its suspense.
    if (!activeArrived) return;
    setCardVisible(true);
    const t = setTimeout(() => setCardVisible(false), 4000);
    return () => clearTimeout(t);
  }, [lastLog, activeArrived]);

  // Release the roll latch once the turn advances or the phase changes.
  useEffect(() => {
    setRollBusy(false);
  }, [engineState.phase, engineState.currentPlayerIndex]);

  // Can the local player end their turn right now?
  const canEndTurn =
    isMyTurn && engineState.phase === "awaiting-end-turn" && (myPlayer?.cash ?? 0) >= 0;

  // Can the local player roll right now? (Board-centre Roll button.)
  const canRoll = isMyTurn && engineState.phase === "awaiting-roll";
  const handleRoll = () => {
    if (rollBusy) return;
    setRollBusy(true);
    onRoll?.();
  };

  // Dice stay on the board at all times: before the first roll (or at the top
  // of a turn) they rest showing a neutral pair rather than vanishing.
  const hasRolled = !!engineState.dice;
  const displayDice: [number, number] = engineState.dice
    ? [engineState.dice[0], engineState.dice[1]]
    : [1, 1];

  // Bump the spin counter in the SAME render the dice change (guarded by the
  // last signature so React StrictMode's double-invoke doesn't double-count),
  // keeping the spin in sync with the new value.
  const diceSig = hasRolled
    ? `${displayDice[0]}-${displayDice[1]}-${engineState.currentTurn}`
    : "idle";
  if (diceSig !== lastDiceSig.current) {
    lastDiceSig.current = diceSig;
    if (hasRolled) diceSpins.current += 1;
  }
  const diceSpin = diceSpins.current;

  return (
    <div className="monopoly-board">
      {/* Board Center (Richup.io Style) */}
      <div
        className="board-center"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          gap: "0.75rem",
          background: "linear-gradient(135deg, #120e24 0%, #0a0814 100%)",
          padding: "1.5rem",
          borderRadius: "2px",
        }}
      >
        {/* Top Row: Logo, Mama Put Pot and Game Phase/Turn HUD */}
        <div
          className="board-center-top-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 5,
            width: "100%",
          }}
        >
          <div
            className="board-center-logo"
            style={{
              margin: 0,
              fontSize: "1.2rem",
              letterSpacing: "0.2em",
              background: "linear-gradient(135deg, var(--color-gold) 0%, #f97316 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            ODOGWU EMPIRE
          </div>

          {/* Mama Put Pot Display */}
          {engineState.settings?.freeParkingJackpot && (
            <motion.div
              className="mama-put-pot-display"
              style={{
                margin: 0,
                padding: "0.35rem 0.75rem",
                background: "rgba(70, 199, 141, 0.1)",
                border: "1px solid rgba(70, 199, 141, 0.25)",
                borderRadius: "2px",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "var(--color-naira)",
                boxShadow: "0 0 10px rgba(70, 199, 141, 0.15)",
                zIndex: 5,
              }}
              key={engineState.freeParkingPot}
              animate={
                engineState.freeParkingPot > 0
                  ? {
                      boxShadow: [
                        "0 0 10px rgba(70,199,141,0.15)",
                        "0 0 22px rgba(70,199,141,0.45)",
                        "0 0 10px rgba(70,199,141,0.15)",
                      ],
                    }
                  : {}
              }
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span>🍲 Mama Put Pot:</span>
              <motion.span
                key={engineState.freeParkingPot}
                initial={{ scale: 1.3, color: "#46c78d" }}
                animate={{ scale: 1, color: "var(--color-naira)" }}
                transition={{ duration: 0.4 }}
              >
                ₦{(engineState.freeParkingPot ?? 0).toLocaleString()}
              </motion.span>
            </motion.div>
          )}

          {/* NEPA blackout indicator (chaos mode) */}
          {engineState.blackout && (
            <motion.div
              className="blackout-display"
              style={{
                margin: 0,
                padding: "0.35rem 0.75rem",
                background: "rgba(232, 182, 74, 0.12)",
                border: "1px solid rgba(232, 182, 74, 0.4)",
                borderRadius: "2px",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "var(--color-gold, #e8b64a)",
                zIndex: 5,
              }}
              initial={{ opacity: 0, y: -6 }}
              animate={{
                opacity: 1,
                y: 0,
                boxShadow: [
                  "0 0 8px rgba(232,182,74,0.15)",
                  "0 0 20px rgba(232,182,74,0.5)",
                  "0 0 8px rgba(232,182,74,0.15)",
                ],
              }}
              transition={{ boxShadow: { duration: 1.4, repeat: Infinity } }}
              title="NEPA don take light — rent is frozen until the round comes back around."
            >
              ⚡ NEPA don take light — rent frozen!
            </motion.div>
          )}

          {/* Game Phase / Turn Indicator */}
          <motion.div
            key={engineState.phase}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "2px",
              zIndex: 5,
            }}
          >
            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Phase:{" "}
              <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>
                {engineState.phase.replace("-", " ")}
              </span>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
              Round:{" "}
              <span style={{ color: "#3b82f6", fontWeight: "bold" }}>
                {engineState.currentTurn ?? 1}
              </span>
              {engineState.settings?.turnLimit > 0 && ` / ${engineState.settings.turnLimit}`}
            </div>
          </motion.div>
        </div>

        {/* Central Display: Dice + Active Player Status (Richup.io centerpiece) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
            marginTop: "1.5rem",
            zIndex: 10,
          }}
        >
          {/* Dice — permanently on the stage. Stable keys mean the dice never
              unmount: on each roll the cubes spin to their new value in place
              (a brief shake adds tumble). They rest on a neutral pair before
              the first roll of a turn. */}
          <div className={`dice-stage${diceShaking ? " shaking" : ""}${hasRolled ? "" : " dice-idle"}`}>
            {renderDie3D(displayDice[0], "die0", diceSpin)}
            {renderDie3D(displayDice[1], "die1", diceSpin)}
          </div>

          {/* Active Player Hero card */}
          {activePlayerId ? (
            <motion.div
              key={activePlayerId}
              className={`active-player-hero${activePlayerId === mySessionId ? " is-me" : ""}`}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              <div className="active-player-hero-avatar">{getTokenEmoji(activePlayerId)}</div>
              <div className="active-player-hero-meta">
                <div className="active-player-hero-name">{players[activePlayerIndex]?.name}</div>
                <div className="active-player-hero-sub">
                  {activePlayerId === mySessionId ? "Your turn" : "Now playing"}
                </div>
              </div>
            </motion.div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Waiting for players...
            </div>
          )}

          {/* Roll Dice — right on the board when it's your turn, so you never
              have to hunt for it in the side panel. */}
          {canRoll && onRoll && (
            <motion.button
              className="board-roll-btn"
              onClick={handleRoll}
              disabled={rollBusy}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              whileHover={{ scale: rollBusy ? 1 : 1.05 }}
              whileTap={{ scale: rollBusy ? 1 : 0.95 }}
              style={{
                marginTop: "1rem",
                padding: "0.6rem 2rem",
                fontSize: "1rem",
                fontWeight: 700,
                borderRadius: "2px",
                background: "linear-gradient(135deg, var(--color-gold) 0%, #f97316 100%)",
                boxShadow: "0 4px 15px rgba(232, 182, 74, 0.4)",
                border: "none",
                color: "#1a1205",
                cursor: rollBusy ? "default" : "pointer",
                opacity: rollBusy ? 0.6 : 1,
              }}
            >
              🎲 {myPlayer?.inJail ? "Roll (Jail)" : "Roll Dice"}
            </motion.button>
          )}

          {/* End Turn button — prominently centered */}
          {canEndTurn && onEndTurn && (
            <motion.button
              className="board-end-turn-btn"
              onClick={onEndTurn}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: "0.6rem 2rem",
                fontSize: "1rem",
                fontWeight: 700,
                borderRadius: "2px",
                background: "linear-gradient(135deg, #46c78d 0%, #2f9e6b 100%)",
                boxShadow: "0 4px 15px rgba(70, 199, 141, 0.4)",
                border: "none",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              End Turn
            </motion.button>
          )}

          {/* In-game trivia — shown during OTHER players' turns */}
          {!isMyTurn && activePlayerId && (
            <div className="board-trivia-box">
              <span className="trivia-label">🇳🇬 Did you know?</span>
              <AnimatePresence mode="wait">
                <motion.p
                  key={boardTrivia}
                  className="trivia-text"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                >
                  {boardTrivia}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Bottom Section: Game Feed & Card draws — grows to fill the space
            below the dice, then scrolls internally. */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            flex: "1 1 0",
            minHeight: 0,
            zIndex: 5,
          }}
        >
          {/* Drawn Card Overlay */}
          <AnimatePresence>
            {activeCardDraw && cardVisible && (
              <motion.div
                className={`card-draw-overlay ${activeCardDraw.type}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.25 }}
                style={{
                  width: "100%",
                  maxWidth: "450px",
                  marginBottom: "0.5rem",
                  borderRadius: "2px",
                }}
              >
                <div className="card-deck-title">
                  {activeCardDraw.type} DRAWN BY {activeCardDraw.player.toUpperCase()}
                </div>
                <div className="card-text">"{activeCardDraw.text}"</div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center: Game Feed — blends into the board-center background (no boxed panel) */}
          <div
            className="board-center-feed"
            style={{
              width: "100%",
              maxWidth: "550px",
              margin: 0,
              background: "transparent",
              border: "none",
              flex: "1 1 0",
              minHeight: 0,
            }}
          >
            <div
              className="board-center-feed-logs"
              style={{ padding: "0.5rem 1rem" }}
              role="log"
              aria-live="polite"
              aria-label="Game events (dice rolls, turns, rent and cards)"
            >
              {engineState.log?.map((logLine: string, idx: number) => (
                <div
                  key={idx}
                  className={getLogClass(logLine)}
                  style={{ fontSize: "0.78rem", padding: "2px 0", textAlign: "center" }}
                >
                  {logLine}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Render 40 tiles */}
      {BOARD.map((tile: Tile) => {
        const coords = getTileGridCoords(tile.pos);
        const tileState = tilesState[tile.pos];
        const isCorner = tile.pos % 10 === 0;

        // Find players on this tile (using their walking display position)
        const playersOnTile = players.filter(
          (p: Player) => getDisplayedPos(p) === tile.pos && !p.bankrupt,
        );
        const hasMyToken = myPosition === tile.pos;
        const hasActivePlayer = playersOnTile.some((p: Player) => p.id === activePlayerId);

        // Render color bar for property tiles
        const hasColorBar = tile.type === "property";
        const groupColor = hasColorBar ? (tile as PropertyTile).group : null;
        const tileIcon = !hasColorBar ? getSpecialTileIcon(tile) : "";

        // Render houses/hotels — richup.io style: one icon + a ×N count badge
        // (a compact pill on the colour band) rather than repeating the icon.
        const showHouses = tileState && tileState.houses > 0;
        const isHotel = tileState && tileState.houses === 5;
        const houseCount = tileState ? tileState.houses : 0;

        // Price formatting
        let priceLabel = "";
        if ("price" in tile) {
          priceLabel = `₦${(tile.price / 1000).toFixed(0)}k`;
        } else if ("amount" in tile) {
          priceLabel = `₦${(tile.amount / 1000).toFixed(0)}k`;
        }

        // Owner emoji
        const ownerEmoji = tileState && tileState.ownerId ? getTokenEmoji(tileState.ownerId) : null;
        const isMortgaged = tileState && tileState.mortgaged;

        const getTileTitle = () => {
          let t = tile.name;
          if (tileState) {
            if (tileState.mortgaged) {
              t += " (Mortgaged)";
            } else if (tileState.houses > 0) {
              const devName = tileState.houses > 0 ? getDevelopmentName(tileState.houses) : "";
              t += ` (${devName})`;
            }
          }
          return t;
        };

        const getOwnerTitle = () => {
          const ownerName =
            players.find((p: Player) => p.id === tileState.ownerId)?.name || "Unknown";
          if (isMortgaged) {
            return `Owned by ${ownerName} (Mortgaged)`;
          }
          if (tileState.houses > 0) {
            const devName = getDevelopmentName(tileState.houses);
            return `Owned by ${ownerName} - ${devName}`;
          }
          return `Owned by ${ownerName}`;
        };

        return (
          <div
            key={tile.pos}
            className={`tile ${isCorner ? "tile-corner" : ""} edge-${getTileEdge(tile.pos)}${hasMyToken ? " tile-has-me" : ""}${playersOnTile.length > 0 ? " tile-has-player" : ""}${hasActivePlayer ? " tile-active-player" : ""}${isMortgaged ? " tile-mortgaged" : ""}`}
            style={{
              gridColumn: coords.col,
              gridRow: coords.row,
              cursor: "pointer",
              ...getColorBarPadding(tile.pos, hasColorBar, isCorner),
            }}
            onClick={() => onTileClick?.(tile.pos)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTileClick?.(tile.pos);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={getTileTitle()}
            title={getTileTitle()}
          >
            {/* Real-place photo behind the tile content (purchasable tiles) */}
            {tileImageUrl(tile.pos) && (
              <div className="tile-photo-layer">
                <TileImage pos={tile.pos} />
                <div className="tile-photo-scrim" />
              </div>
            )}

            {/* Edge-aware color bar */}
            {hasColorBar && groupColor && (
              <div
                className="tile-color-bar"
                style={{
                  backgroundColor: `var(--color-${groupColor})`,
                  ...getColorBarStyle(tile.pos),
                }}
              />
            )}

            {/* House dots container */}
            {showHouses && (
              <div className="tile-houses">
                {isHotel ? (
                  <IconHotel className="hotel-dot" />
                ) : (
                  <>
                    <IconHouse className="house-dot" />
                    {houseCount > 1 && <span className="house-count">×{houseCount}</span>}
                  </>
                )}
              </div>
            )}

            {/* Special tile icon */}
            {tileIcon && <span className="tile-type-icon">{tileIcon}</span>}

            {/* Tile Name — the short label only shows on narrow phones (CSS
                media query), where side tiles are too tight for the full
                name to read without collapsing into a vertical letter-stack. */}
            <span className="tile-name">
              <span className="tile-name-full">{boardLabel(tile)}</span>
              <span className="tile-name-short">{tile.shortName ?? boardLabel(tile)}</span>
            </span>

            {/* Richup.io permanent bottom price stripe. Mortgaged tiles keep the
                price (the word "Mortgaged" overflows narrow side tiles); state is
                shown by the greyed photo + 🔒 in the stripe and owner badge. */}
            {priceLabel && (
              <span className="tile-price">{isMortgaged ? <>🔒 {priceLabel}</> : priceLabel}</span>
            )}

            {/* Owner badge */}
            {ownerEmoji && (
              <span
                className="tile-owner-indicator"
                title={getOwnerTitle()}
                style={
                  isMortgaged
                    ? {
                        border: "1px solid var(--color-danger)",
                        background: "rgba(239, 68, 68, 0.2)",
                      }
                    : {}
                }
              >
                {ownerEmoji} {isMortgaged && "🔒"}
              </span>
            )}

            {/* Player tokens — each animates with layoutId so it slides across board */}
            {playersOnTile.length > 0 && (
              <div className="tile-tokens-container">
                {playersOnTile.map((p: Player) => (
                  <motion.div
                    key={p.id}
                    layoutId={`player-token-${p.id}`}
                    className={`player-token${p.id === mySessionId ? " player-token-me" : ""}${p.id === activePlayerId ? " player-token-active" : ""}`}
                    title={p.name}
                    layout="position"
                    transition={{
                      layout: {
                        type: "spring",
                        stiffness: 200,
                        damping: 22,
                        duration: 0.6,
                      },
                    }}
                    whileHover={{ scale: 1.3, zIndex: 50 }}
                  >
                    {getTokenEmoji(p.id)}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Hover tooltip — mini deed summary; click opens the full inspector */}
            {(tile.type === "property" || tile.type === "airport" || tile.type === "utility") && (
              <div className="tile-tooltip">
                <div className="tile-tooltip-name">{tile.name}</div>
                <div className="tile-tooltip-row">
                  {tileState?.ownerId
                    ? `Owned by ${players.find((p: Player) => p.id === tileState.ownerId)?.name ?? "—"}`
                    : "Unowned"}
                </div>
                {tile.type === "property" && (
                  <div className="tile-tooltip-row">
                    Rent: ₦
                    {/* When owned, use the engine's rent (doubles base rent for a
                        full unimproved set); otherwise preview the base rate. */}
                    {(tileState?.ownerId
                      ? getRent(engineState, tile.pos, 7)
                      : (tile as PropertyTile).rent[0]
                    ).toLocaleString()}
                    {(tileState?.houses ?? 0) > 0 && ` · ${getDevelopmentName(tileState.houses)}`}
                  </div>
                )}
                {"price" in tile && (
                  <div className="tile-tooltip-row tile-tooltip-muted">
                    Price ₦{tile.price.toLocaleString()}
                  </div>
                )}
                {tileState?.mortgaged && (
                  <div className="tile-tooltip-row" style={{ color: "var(--color-danger)" }}>
                    🔒 Mortgaged
                  </div>
                )}
                <div className="tile-tooltip-row tile-tooltip-muted">Click for full deed</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
