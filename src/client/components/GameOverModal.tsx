import { motion } from "framer-motion";
import { BOARD, Tile } from "../../data/board";
import { tokenEmoji } from "../../data/tokens";
import { GameState, Player, TileState } from "../../engine/types";
import { RoomState } from "../../shared/room";

interface GameOverModalProps {
  engineState: GameState;
  roomState: RoomState | null;
  mySessionId: string | null;
  onResetGame: () => void;
}

export default function GameOverModal({ engineState, roomState, mySessionId, onResetGame }: GameOverModalProps) {
  const calculatePlayerNetWorth = (p: Player, tiles: Record<number, TileState>) => {
    if (p.bankrupt) return 0;
    let netWorth = p.cash;
    Object.keys(tiles || {}).forEach((posStr) => {
      const pos = parseInt(posStr, 10);
      const ts = tiles[pos];
      if (ts.ownerId === p.id) {
        const tile = BOARD[pos];
        if ("price" in tile) {
          if (ts.mortgaged) {
            netWorth += tile.mortgage;
          } else {
            netWorth += tile.price;
            if (tile.type === "property" && ts.houses > 0) {
              netWorth += ts.houses * tile.houseCost;
            }
          }
        }
      }
    });
    return netWorth;
  };

  const getLeaderboard = () => {
    if (!engineState) return [];
    return [...engineState.players]
      .map((p) => {
        const netWorth = calculatePlayerNetWorth(p, engineState.tiles);
        const ownedTiles = BOARD.filter((t) => engineState.tiles[t.pos]?.ownerId === p.id);
        return {
          ...p,
          netWorth,
          assetsCount: ownedTiles.length,
        };
      })
      .sort((a, b) => b.netWorth - a.netWorth);
  };

  const isHost = roomState?.hostId === mySessionId;

  return (
    <div className="modal-overlay">
      <motion.div
        className="modal-content"
        style={{ maxWidth: "800px", background: "var(--surface-2)", border: "1px solid var(--border-color)", padding: "2rem" }}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "2rem", color: "var(--color-gold)", margin: "0 0 0.5rem 0", textTransform: "uppercase" }}>Game Over</h2>
          {(() => {
            const winner = engineState.players.find((p) => p.id === engineState.winnerId);
            return winner ? (
              <>
                <motion.span
                  style={{ display: "inline-block", fontSize: "3rem", margin: "1rem 0" }}
                  animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                  transition={{ delay: 0.7, duration: 1.0, ease: "easeInOut" }}
                >👑</motion.span>
                <div>
                  <span className="winner-name" style={{ fontWeight: "bold", color: "var(--color-naira)" }}>{winner.name}</span>
                  {winner.id === mySessionId ? " — You don hammer! " : " is the Odogwu! "}
                </div>
                <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "0.25rem" }}>
                  {winner.id === mySessionId
                    ? "You buy the land. You become the Odogwu. E no easy!"
                    : `${winner.name} chop all your money. Better luck next time!`}
                </div>
              </>
            ) : (
              "The game has ended!"
            );
          })()}
        </div>
        
        <div className="leaderboard-container">
          <h3 style={{ margin: "0 0 1rem 0", color: "var(--color-gold)", textTransform: "uppercase", fontSize: "1rem", letterSpacing: "1px" }}>Final Leaderboard</h3>
          <div className="leaderboard-table" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div className="leaderboard-header" style={{ display: "flex", fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "bold", paddingBottom: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ width: "10%" }}>Rank</span>
              <span style={{ width: "25%" }}>Player</span>
              <span style={{ width: "15%" }}>Status</span>
              <span style={{ width: "20%" }}>Cash</span>
              <span style={{ width: "15%" }}>Assets</span>
              <span style={{ width: "15%" }}>Net Worth</span>
            </div>
            {getLeaderboard().map((p, index) => {
              const lobbyPlayer = roomState?.lobbyPlayers?.get(p.id);
              const playerToken = tokenEmoji(lobbyPlayer?.tokenId);
              return (
                <motion.div
                  key={p.id}
                  className={`leaderboard-row ${p.id === engineState.winnerId ? "winner-row" : ""}`}
                  style={{ display: "flex", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)", background: p.id === engineState.winnerId ? "rgba(245, 158, 11, 0.05)" : "transparent" }}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.35, ease: "easeOut" }}
                >
                  <span className="player-rank" style={{ width: "10%", fontSize: "1.2rem" }}>
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                  </span>
                  <span className="player-identity" style={{ width: "25%", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span>{playerToken}</span>
                    <span style={{ fontWeight: 600 }}>{p.name} {p.id === mySessionId && "(You)"}</span>
                  </span>
                  <span className={`player-status ${p.bankrupt ? "bankrupt" : "active"}`} style={{ width: "15%", color: p.bankrupt ? "var(--color-red)" : "var(--color-green)" }}>
                    {p.bankrupt ? "Bankrupt 💀" : "Solvent"}
                  </span>
                  <span className="player-cash" style={{ width: "20%" }}>₦{p.cash.toLocaleString()}</span>
                  <span className="player-assets" style={{ width: "15%" }}>{p.assetsCount} properties</span>
                  <span className="player-networth" style={{ width: "15%", fontWeight: "bold", color: index === 0 ? "var(--color-gold)" : "var(--color-naira)" }}>
                    ₦{p.netWorth.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="leaderboard-container" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ margin: "0 0 1rem 0", color: "var(--color-gold)", textTransform: "uppercase", fontSize: "1rem", letterSpacing: "1px" }}>Game Summary</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              { label: "Rounds Played", value: engineState.currentTurn ?? 1 },
              { label: "Properties Owned", value: BOARD.filter((t: Tile) => engineState.tiles[t.pos]?.ownerId).length },
              { label: "Players", value: engineState.players.length },
            ].map((s) => (
              <div key={s.label} style={{ background: "var(--surface-1)", borderRadius: "var(--radius-md)", padding: "0.75rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-gold)" }}>{s.value}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <button className="button-primary full-width-btn" style={{ padding: "1rem", marginTop: "1rem" }} onClick={onResetGame}>
            🔄 Return to Lobby
          </button>
        )}
      </motion.div>
    </div>
  );
}
