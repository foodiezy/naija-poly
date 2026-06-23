import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BOARD, Tile, PropertyTile } from "../../data/board";
import { tokenEmoji } from "../../data/tokens";

// Shorter label for the cramped board tile. The ✈/⚡/📡 icon already conveys the
// type, so drop the redundant "Airport"/"Corporation" suffix; the full name
// still shows in the deed inspector.
function boardLabel(tile: Tile): string {
  if (tile.type === "airport") return tile.name.replace(/\s*Airport$/i, "");
  if (tile.type === "utility") return tile.name.replace(/\s*Corporation$/i, "");
  return tile.name;
}

interface GameBoardProps {
  engineState: any;
  roomState: any;
  mySessionId?: string;
  onTileClick?: (pos: number) => void;
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
  if (pos <= 10) return { position: "absolute", top: 0, left: 0, right: 0, height: "11px", width: "auto", borderRadius: "2px 2px 0 0" };
  // left col: bar on right (facing center)
  if (pos <= 20) return { position: "absolute", top: 0, right: 0, bottom: 0, width: "11px", height: "auto", borderRadius: "0 2px 2px 0" };
  // top row: bar on bottom (facing center)
  if (pos <= 30) return { position: "absolute", bottom: 0, left: 0, right: 0, height: "11px", width: "auto", borderRadius: "0 0 2px 2px" };
  // right col: bar on left (facing center)
  return { position: "absolute", top: 0, left: 0, bottom: 0, width: "11px", height: "auto", borderRadius: "2px 0 0 2px" };
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
    case "go":      return "🚀";
    case "jail":    return "🔒";
    case "free":    return "🍲";
    case "gotojail": return "👮";
    case "chance":  return "❓";
    case "esusu":   return "🤲";
    case "airport": return "✈️";
    case "utility":
      return (tile.name.toLowerCase().includes("power") || tile.name.toLowerCase().includes("nepa") || tile.name.toLowerCase().includes("ecg"))
        ? "⚡" : "📡";
    default: return "";
  }
}

// Map 0-39 board position to 11x11 CSS Grid (1-indexed row/column)
function getTileGridCoords(pos: number): { row: number; col: number } {
  if (pos >= 0 && pos <= 10) {
    // Bottom edge: Go (0) is bottom-right, Jail (10) is bottom-left
    return { row: 11, col: 11 - pos };
  } else if (pos > 10 && pos <= 20) {
    // Left edge: pos 11 is row 10, pos 20 is row 1 (Bukka Rest Stop)
    return { row: 11 - (pos - 10), col: 1 };
  } else if (pos > 20 && pos <= 30) {
    // Top edge: pos 21 is col 2, pos 30 is col 11 (Go to Jail)
    return { row: 1, col: 1 + (pos - 20) };
  } else {
    // Right edge: pos 31 is row 2, pos 39 is row 10
    return { row: 1 + (pos - 30), col: 11 };
  }
}

export default function GameBoard({ engineState, roomState, mySessionId, onTileClick }: GameBoardProps) {
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

  // Identify the local player's position and the active turn player
  const myPlayer = mySessionId ? players.find((p: any) => p.id === mySessionId) : null;
  const myPosition = myPlayer ? myPlayer.position : -1;
  const activePlayerIndex = engineState.currentPlayerIndex ?? -1;
  const activePlayerId = activePlayerIndex >= 0 && players[activePlayerIndex] ? players[activePlayerIndex].id : null;

  const logsEndRef = useRef<HTMLDivElement>(null);
  // Whether the drawn-card banner is currently shown (auto-dismisses).
  const [cardVisible, setCardVisible] = useState(false);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [engineState.log?.length]);

  const getLogClass = (logLine: string) => {
    if (logLine.includes("rolled") || logLine.includes("START") || logLine.includes("Prison") || logLine.includes("escaped")) {
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

  const renderDie3D = (value: number, key: string) => {
    let rotation = "";
    switch (value) {
      case 1: rotation = "rotateX(0deg) rotateY(0deg)"; break;
      case 6: rotation = "rotateX(180deg) rotateY(0deg)"; break;
      case 2: rotation = "rotateX(-90deg) rotateY(0deg)"; break;
      case 5: rotation = "rotateX(90deg) rotateY(0deg)"; break;
      case 3: rotation = "rotateX(0deg) rotateY(90deg)"; break;
      case 4: rotation = "rotateX(0deg) rotateY(-90deg)"; break;
      default: rotation = "rotateX(0deg) rotateY(0deg)";
    }

    return (
      <motion.div
        key={key}
        className="die-3d-wrapper"
        initial={{ rotateY: -360, scale: 0.5, opacity: 0 }}
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, duration: 0.5 }}
      >
        <div className="die-3d">
          <div className="cube" style={{ transform: rotation }}>
            <div className="face front" data-value="1">
              <span className="pip"></span>
            </div>
            <div className="face back" data-value="6">
              <span className="pip"></span><span className="pip"></span>
              <span className="pip"></span><span className="pip"></span>
              <span className="pip"></span><span className="pip"></span>
            </div>
            <div className="face top" data-value="2">
              <span className="pip"></span><span className="pip"></span>
            </div>
            <div className="face bottom" data-value="5">
              <span className="pip"></span><span className="pip"></span>
              <span className="pip"></span>
              <span className="pip"></span><span className="pip"></span>
            </div>
            <div className="face left" data-value="3">
              <span className="pip"></span><span className="pip"></span>
              <span className="pip"></span>
            </div>
            <div className="face right" data-value="4">
              <span className="pip"></span><span className="pip"></span>
              <span className="pip"></span><span className="pip"></span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  // Helper to extract the last card draw text from logs
  const lastLog = engineState.log && engineState.log.length > 0 ? engineState.log[engineState.log.length - 1] : "";
  const cardDrawMatch = lastLog.match(/(.+) drew (Chance|Esusu): "(.+)"/);
  
  const activeCardDraw = cardDrawMatch ? {
    player: cardDrawMatch[1],
    type: cardDrawMatch[2].toLowerCase(),
    text: cardDrawMatch[3]
  } : null;

  // Show the drawn-card banner briefly, then auto-dismiss so it stops covering
  // the game feed and doesn't linger until the next log line.
  useEffect(() => {
    if (!cardDrawMatch) {
      setCardVisible(false);
      return;
    }
    setCardVisible(true);
    const t = setTimeout(() => setCardVisible(false), 4000);
    return () => clearTimeout(t);
  }, [lastLog]);

  return (
    <div className="monopoly-board">
      {/* Board Center */}
      <div className="board-center">
        <div className="board-center-logo">ODOGWU EMPIRE</div>
        
        {/* Top Row: Bukka Pot and Game Phase/Turn HUD */}
        <div className="board-center-top-row">
          {/* Bukka Pot Display */}
          {engineState.settings?.freeParkingJackpot ? (
            <motion.div
              className="bukka-pot-display"
              style={{ margin: 0, padding: "0.35rem 0.75rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "20px", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: "bold", color: "var(--color-naira)", boxShadow: "0 0 10px rgba(16, 185, 129, 0.15)", zIndex: 5 }}
              key={engineState.freeParkingPot}
              animate={engineState.freeParkingPot > 0 ? {
                boxShadow: ["0 0 10px rgba(16,185,129,0.15)", "0 0 22px rgba(16,185,129,0.45)", "0 0 10px rgba(16,185,129,0.15)"],
              } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span>🍲 Bukka Pot:</span>
              <motion.span
                key={engineState.freeParkingPot}
                initial={{ scale: 1.3, color: "#10b981" }}
                animate={{ scale: 1, color: "var(--color-naira)" }}
                transition={{ duration: 0.4 }}
              >
                ₦{(engineState.freeParkingPot ?? 0).toLocaleString()}
              </motion.span>
            </motion.div>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          {/* Game Phase / Turn Indicator */}
          <motion.div
            key={engineState.phase}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px", zIndex: 5 }}
          >
            <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Phase: <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{engineState.phase.replace("-", " ")}</span>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
              Round: <span style={{ color: "#3b82f6", fontWeight: "bold" }}>{engineState.currentTurn ?? 1}</span>
              {engineState.settings?.turnLimit > 0 && ` / ${engineState.settings.turnLimit}`}
            </div>
          </motion.div>
        </div>

        {/* Center: Game Feed scrollable logs box */}
        <div className="board-center-feed">
          <div className="board-center-feed-title">📢 Game Feed</div>
          <div className="board-center-feed-logs">
            {engineState.log?.map((logLine: string, idx: number) => (
              <div key={idx} className={getLogClass(logLine)}>
                {logLine}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Bottom Row: Dice and Card draws */}
        <div className="board-center-bottom-row">
          {/* Dice */}
          <AnimatePresence mode="wait">
            {engineState.dice && (
              <motion.div
                key={`${engineState.dice[0]}-${engineState.dice[1]}-${engineState.currentTurn}`}
                className="dice-container-center"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {renderDie3D(engineState.dice[0], `die0-${engineState.dice[0]}-${engineState.currentTurn}`)}
                {renderDie3D(engineState.dice[1], `die1-${engineState.dice[1]}-${engineState.currentTurn}`)}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Drawn Card Overlay */}
          <AnimatePresence>
            {activeCardDraw && cardVisible && (
              <motion.div
                className={`card-draw-overlay ${activeCardDraw.type}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="card-deck-title">{activeCardDraw.type} DRAWN BY {activeCardDraw.player.toUpperCase()}</div>
                <div className="card-text">"{activeCardDraw.text}"</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Render 40 tiles */}
      {BOARD.map((tile: Tile) => {
        const coords = getTileGridCoords(tile.pos);
        const tileState = tilesState[tile.pos];
        const isCorner = tile.pos % 10 === 0;

        // Find players on this tile
        const playersOnTile = players.filter((p: any) => p.position === tile.pos && !p.bankrupt);
        const hasMyToken = myPosition === tile.pos;
        const hasActivePlayer = playersOnTile.some((p: any) => p.id === activePlayerId);

        // Render color bar for property tiles
        const hasColorBar = tile.type === "property";
        const groupColor = hasColorBar ? (tile as PropertyTile).group : null;
        const tileIcon = !hasColorBar ? getSpecialTileIcon(tile) : "";

        // Render houses/hotels
        const showHouses = tileState && tileState.houses > 0;
        const isHotel = tileState && tileState.houses === 5;
        const houseDots = [];
        if (showHouses && !isHotel) {
          for (let i = 0; i < tileState.houses; i++) {
            houseDots.push(<div key={i} className="house-dot" />);
          }
        }

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
              const devName = tileState.houses === 5 ? "Hotel" : tileState.houses === 4 ? "Mini-Estate" : tileState.houses === 3 ? "Mansion" : tileState.houses === 2 ? "Duplex" : "Bungalow";
              t += ` (${devName})`;
            }
          }
          return t;
        };

        const getOwnerTitle = () => {
          const ownerName = players.find((p: any) => p.id === tileState.ownerId)?.name || "Unknown";
          if (isMortgaged) {
            return `Owned by ${ownerName} (Mortgaged)`;
          }
          if (tileState.houses > 0) {
            const devName = tileState.houses === 5 ? "Hotel" : tileState.houses === 4 ? "Mini-Estate" : tileState.houses === 3 ? "Mansion" : tileState.houses === 2 ? "Duplex" : "Bungalow";
            return `Owned by ${ownerName} - ${devName}`;
          }
          return `Owned by ${ownerName}`;
        };

        return (
          <div
            key={tile.pos}
            className={`tile ${isCorner ? "tile-corner" : ""} edge-${getTileEdge(tile.pos)}${hasMyToken ? " tile-has-me" : ""}${playersOnTile.length > 0 ? " tile-has-player" : ""}${hasActivePlayer ? " tile-active-player" : ""}`}
            style={{
              gridColumn: coords.col,
              gridRow: coords.row,
              cursor: "pointer",
              ...getColorBarPadding(tile.pos, hasColorBar, isCorner),
            }}
            onClick={() => onTileClick?.(tile.pos)}
            title={getTileTitle()}
          >
            {/* Edge-aware color bar */}
            {hasColorBar && groupColor && (
              <div
                className="tile-color-bar"
                style={{ backgroundColor: `var(--color-${groupColor})`, ...getColorBarStyle(tile.pos) }}
              />
            )}

            {/* House dots container */}
            {showHouses && (
              <div className="tile-houses">
                {isHotel ? <div className="hotel-dot" /> : houseDots}
              </div>
            )}

            {/* Special tile icon */}
            {tileIcon && <span className="tile-type-icon">{tileIcon}</span>}

            {/* Tile Name */}
            <span className="tile-name">{boardLabel(tile)}</span>

            {/* Price shows only until purchased; once owned the badge signals
                ownership (but a mortgaged tile still flags "Mortgaged"). */}
            {priceLabel && (!tileState?.ownerId || isMortgaged) && (
              <span
                className="tile-price"
                style={isMortgaged ? { color: "var(--color-danger)", textDecoration: "line-through" } : {}}
              >
                {isMortgaged ? "Mortgaged" : priceLabel}
              </span>
            )}

            {/* Owner badge */}
            {ownerEmoji && (
              <span
                className="tile-owner-indicator"
                title={getOwnerTitle()}
                style={isMortgaged ? { border: "1px solid var(--color-danger)", background: "rgba(239, 68, 68, 0.2)" } : {}}
              >
                {ownerEmoji} {isMortgaged && "🔒"}
              </span>
            )}

            {/* Player tokens — each animates with layoutId so it slides across board */}
            {playersOnTile.length > 0 && (
              <div className="tile-tokens-container">
                {playersOnTile.map((p: any) => (
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
                    ? `Owned by ${players.find((p: any) => p.id === tileState.ownerId)?.name ?? "—"}`
                    : "Unowned"}
                </div>
                {tile.type === "property" && (
                  <div className="tile-tooltip-row">
                    Rent: ₦{((tileState?.houses ?? 0) > 0
                      ? (tile as PropertyTile).rent[tileState.houses]
                      : (tile as PropertyTile).rent[0]
                    ).toLocaleString()}
                    {(tileState?.houses ?? 0) > 0 && ` · ${tileState.houses === 5 ? "Hotel" : tileState.houses === 4 ? "Mini-Estate" : tileState.houses === 3 ? "Mansion" : tileState.houses === 2 ? "Duplex" : "Bungalow"}`}
                  </div>
                )}
                {"price" in tile && (
                  <div className="tile-tooltip-row tile-tooltip-muted">Price ₦{tile.price.toLocaleString()}</div>
                )}
                {tileState?.mortgaged && (
                  <div className="tile-tooltip-row" style={{ color: "var(--color-danger)" }}>🔒 Mortgaged</div>
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
