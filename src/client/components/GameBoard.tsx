import { motion } from "framer-motion";
import { BOARD, Tile, PropertyTile } from "../../data/board";
import { getDevelopmentName, getRent } from "../../engine/engine";
import { tokenEmoji } from "../../data/tokens";
import { GameState, Player } from "../../engine/types";
import { RoomState } from "../../shared/room";
import { zoneOfGroup } from "../lib/zones";
import { IconHouse, IconHotel } from "./icons";
import Dice from "./Dice";

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
  // Animated token positions from the shared walker (owned by App so the buy
  // card can wait for the token to arrive). Falls back to static positions.
  displayedPositions?: Map<string, number>;
  diceAnimating?: boolean;
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
      height: "9px",
      width: "auto",
      borderRadius: "1px 1px 0 0",
    };
  // left col: bar on right (facing center)
  if (pos <= 20)
    return {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: "9px",
      height: "auto",
      borderRadius: "0 1px 1px 0",
    };
  // top row: bar on bottom (facing center)
  if (pos <= 30)
    return {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "9px",
      width: "auto",
      borderRadius: "0 0 1px 1px",
    };
  // right col: bar on left (facing center)
  return {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "9px",
    height: "auto",
    borderRadius: "1px 0 0 1px",
  };
}

// Padding on tile content to clear the absolutely-positioned color bar
function getColorBarPadding(pos: number, hasBar: boolean, isCorner: boolean): React.CSSProperties {
  if (!hasBar || isCorner) return {};
  if (pos <= 10) return { paddingTop: "11px" };
  if (pos <= 20) return { paddingRight: "11px" };
  if (pos <= 30) return { paddingBottom: "11px" };
  return { paddingLeft: "11px" };
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
      return "?";
    case "hustle":
      return "";
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
  displayedPositions: displayedPositionsProp,
  diceAnimating = false,
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

  const getTokenEmoji = (playerId: string) => tokenEmoji(lobbyPlayers.get(playerId)?.tokenId);

  return (
    <div className="monopoly-board">
      {/* Board centre stays decorative only; gameplay status belongs around the board,
          not covering the route players need to read. */}
      <div className="board-center">
        <div className="board-center-adire" aria-hidden="true" />
        <div className="board-center-skyline" aria-hidden="true" />
        <Dice values={engineState.dice} rolling={diceAnimating} />
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

        // The tile's zone drives its band and its owned wash. Handing CSS two
        // custom properties keeps every colour decision in the stylesheet —
        // the alternative is eight `[data-zone="…"]` rules per surface.
        const zoneSlug = groupColor ? zoneOfGroup(groupColor).slug : null;
        const zoneVars = zoneSlug
          ? ({
              "--tile-zone": `var(--zone-${zoneSlug}-bar)`,
              "--tile-zone-tint": `var(--zone-${zoneSlug}-tint)`,
              "--tile-zone-ink": `var(--zone-${zoneSlug}-ink)`,
            } as React.CSSProperties)
          : {};

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
            data-owned={ownerEmoji ? "" : undefined}
            style={{
              gridColumn: coords.col,
              gridRow: coords.row,
              cursor: "pointer",
              ...zoneVars,
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
            {/* No photo layer. A 30px tile rendered a city as a brown smear
                and cost 31 remote Wikimedia fetches on first paint; the deed
                sheet shows the same photo at a size worth its bytes. */}

            {/* Edge-aware color bar */}
            {hasColorBar && groupColor && (
              <div className="tile-color-bar" style={getColorBarStyle(tile.pos)} />
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
            {tileIcon || tile.type === "hustle" ? (
              <span className={`tile-type-icon tile-type-${tile.type}`}>{tileIcon}</span>
            ) : null}

            {/* Side tiles use compact names; phone tiles rely on the location
                ticker and deed sheet instead of squeezing text into the map. */}
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
              <span className="tile-owner-indicator" title={getOwnerTitle()}>
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
