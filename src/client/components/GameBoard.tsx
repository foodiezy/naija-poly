import { BOARD, Tile, PropertyTile } from "../../data/board";

interface GameBoardProps {
  engineState: any;
  roomState: any;
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

export default function GameBoard({ engineState, roomState }: GameBoardProps) {
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

  const getTokenEmoji = (playerId: string) => {
    const player = lobbyPlayers.get(playerId);
    const tokenId = player?.tokenId;
    switch (tokenId) {
      case "okada":
        return "🏍️";
      case "danfo_bus":
        return "🚌";
      case "agbada":
        return "🧥";
      case "eagle":
        return "🦅";
      default:
        return "👤";
    }
  };

  // Helper to extract the last card draw text from logs
  const lastLog = engineState.log && engineState.log.length > 0 ? engineState.log[engineState.log.length - 1] : "";
  const cardDrawMatch = lastLog.match(/(.+) drew (Chance|Esusu): "(.+)"/);
  
  const activeCardDraw = cardDrawMatch ? {
    player: cardDrawMatch[1],
    type: cardDrawMatch[2].toLowerCase(),
    text: cardDrawMatch[3]
  } : null;

  return (
    <div className="monopoly-board">
      {/* Board Center */}
      <div className="board-center">
        <div className="board-center-logo">NAIJA RICHUP</div>
        
        {/* Dice */}
        {engineState.dice && (
          <div className="dice-container-center">
            <div key={`die0-${engineState.dice[0]}`} className="die">{engineState.dice[0]}</div>
            <div key={`die1-${engineState.dice[1]}`} className="die">{engineState.dice[1]}</div>
          </div>
        )}

        {/* Drawn Card Overlay */}
        {activeCardDraw && (
          <div className={`card-draw-overlay ${activeCardDraw.type}`}>
            <div className="card-deck-title">{activeCardDraw.type} DRAWN BY {activeCardDraw.player.toUpperCase()}</div>
            <div className="card-text">"{activeCardDraw.text}"</div>
          </div>
        )}

        {/* Game Phase Indicator */}
        <div style={{ marginTop: "1rem", color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Phase: <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{engineState.phase.replace("-", " ")}</span>
        </div>
      </div>

      {/* Render 40 tiles */}
      {BOARD.map((tile: Tile) => {
        const coords = getTileGridCoords(tile.pos);
        const tileState = tilesState[tile.pos];
        const isCorner = tile.pos % 10 === 0;

        // Find players on this tile
        const playersOnTile = players.filter((p: any) => p.position === tile.pos && !p.bankrupt);

        // Render color bar for property tiles
        const hasColorBar = tile.type === "property";
        const groupColor = hasColorBar ? (tile as PropertyTile).group : null;

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

        return (
          <div
            key={tile.pos}
            className={`tile ${isCorner ? "tile-corner" : ""}`}
            style={{
              gridColumn: coords.col,
              gridRow: coords.row,
            }}
            title={tile.name}
          >
            {/* Color bar if applicable */}
            {hasColorBar && groupColor && (
              <div
                className="tile-color-bar"
                style={{ backgroundColor: `var(--color-${groupColor})` }}
              />
            )}

            {/* House dots container */}
            {showHouses && (
              <div className="tile-houses">
                {isHotel ? <div className="hotel-dot" /> : houseDots}
              </div>
            )}

            {/* Tile Name */}
            <span className="tile-name">{tile.name}</span>

            {/* Tile Price/Amount or Mortgaged */}
            {priceLabel && (
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
                title={`Owned by ${players.find((p: any) => p.id === tileState.ownerId)?.name || "Unknown"}${isMortgaged ? " (Mortgaged)" : ""}`}
                style={isMortgaged ? { border: "1px solid var(--color-danger)", background: "rgba(239, 68, 68, 0.2)" } : {}}
              >
                {ownerEmoji} {isMortgaged && "🔒"}
              </span>
            )}

            {/* Player tokens container */}
            {playersOnTile.length > 0 && (
              <div className="tile-tokens-container">
                {playersOnTile.map((p: any) => (
                  <div
                    key={p.id}
                    className="player-token"
                    title={p.name}
                  >
                    {getTokenEmoji(p.id)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
