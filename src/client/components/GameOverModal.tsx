import { useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { BOARD, Tile } from "../../data/board";
import { tokenEmoji } from "../../data/tokens";
import { GameState, Player, TileState } from "../../engine/types";
import { RoomState } from "../../shared/room";

interface GameOverModalProps {
  engineState: GameState;
  roomState: RoomState | null;
  mySessionId: string | null;
  onResetGame: () => void;
  // Dismiss the results overlay (e.g. to inspect the final board). Available to
  // everyone, so a non-host isn't trapped behind the modal when the host leaves.
  onClose?: () => void;
}

export default function GameOverModal({
  engineState,
  roomState,
  mySessionId,
  onResetGame,
  onClose,
}: GameOverModalProps) {
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

  useEffect(() => {
    if (engineState?.winnerId && engineState.winnerId === mySessionId) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100000 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function () {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti(
          Object.assign({}, defaults, {
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          }),
        );
        confetti(
          Object.assign({}, defaults, {
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          }),
        );
      }, 250);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [engineState?.winnerId, mySessionId]);

  const handleShare = async () => {
    const text = `I just dominated Odogwu Empire as the Odogwu! 👑💵 Buy the land. Bankrupt your friends.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Odogwu Empire", text, url: window.location.origin });
      } catch (err) {
        console.error(err);
      }
    } else {
      navigator.clipboard.writeText(text);
      alert("Results copied to clipboard!");
    }
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
        style={{
          maxWidth: "800px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-color)",
          padding: "2rem",
        }}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        {onClose && (
          <button
            className="trade-card-close"
            onClick={onClose}
            aria-label="Close results"
            style={{ position: "absolute", top: "1rem", right: "1rem" }}
          >
            ×
          </button>
        )}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "2rem",
              color: "var(--color-gold)",
              margin: "0 0 0.5rem 0",
              textTransform: "uppercase",
            }}
          >
            Game Over
          </h2>
          {(() => {
            const winner = engineState.players.find((p) => p.id === engineState.winnerId);
            return winner ? (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                >
                  <h1
                    style={{
                      fontSize: "3.5rem",
                      color: "var(--color-gold)",
                      textShadow: "0 0 20px rgba(232, 182, 74, 0.5)",
                      margin: "0.5rem 0",
                      textTransform: "uppercase",
                      fontWeight: "900",
                      lineHeight: 1.1,
                    }}
                  >
                    {winner.id === mySessionId
                      ? "You Are The Odogwu! 👑"
                      : `${winner.name} is the Odogwu! 👑`}
                  </h1>
                </motion.div>
                <div
                  style={{
                    fontSize: "1.2rem",
                    color: "var(--text-secondary)",
                    fontStyle: "italic",
                    marginBottom: "1.5rem",
                  }}
                >
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
          <h3
            style={{
              margin: "0 0 1rem 0",
              color: "var(--color-gold)",
              textTransform: "uppercase",
              fontSize: "1rem",
              letterSpacing: "1px",
            }}
          >
            Final Leaderboard
          </h3>
          <div
            className="leaderboard-table"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <div
              className="leaderboard-header"
              style={{
                display: "flex",
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                fontWeight: "bold",
                paddingBottom: "0.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
              }}
            >
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
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.75rem 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background:
                      p.id === engineState.winnerId ? "rgba(232, 182, 74, 0.05)" : "transparent",
                  }}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.35, ease: "easeOut" }}
                >
                  <span className="player-rank" style={{ width: "10%", fontSize: "1.2rem" }}>
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                  </span>
                  <span
                    className="player-identity"
                    style={{ width: "25%", display: "flex", gap: "0.5rem", alignItems: "center" }}
                  >
                    <span>{playerToken}</span>
                    <span style={{ fontWeight: 600 }}>
                      {p.name} {p.id === mySessionId && "(You)"}
                    </span>
                  </span>
                  <span
                    className={`player-status ${p.bankrupt ? "bankrupt" : "active"}`}
                    style={{
                      width: "15%",
                      color: p.bankrupt ? "var(--color-red)" : "var(--color-green)",
                    }}
                  >
                    {p.bankrupt ? "Bankrupt 💀" : "Solvent"}
                  </span>
                  <span className="player-cash" style={{ width: "20%" }}>
                    ₦{p.cash.toLocaleString()}
                  </span>
                  <span className="player-assets" style={{ width: "15%" }}>
                    {p.assetsCount} properties
                  </span>
                  <span
                    className="player-networth"
                    style={{
                      width: "15%",
                      fontWeight: "bold",
                      color: index === 0 ? "var(--color-gold)" : "var(--color-naira)",
                    }}
                  >
                    ₦{p.netWorth.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="leaderboard-container" style={{ marginTop: "1.25rem" }}>
          <h3
            style={{
              margin: "0 0 1rem 0",
              color: "var(--color-gold)",
              textTransform: "uppercase",
              fontSize: "1rem",
              letterSpacing: "1px",
            }}
          >
            Match Highlights
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            {(() => {
              if (!engineState.stats) return null;

              const awards = [
                {
                  id: "rentPaid",
                  title: "Biggest Donor 💸",
                  getVal: (s: any) => s.rentPaid,
                  format: (v: number) => `₦${v.toLocaleString()}`,
                },
                {
                  id: "highestAuctionBid",
                  title: "Biggest Spender 🤑",
                  getVal: (s: any) => s.highestAuctionBid,
                  format: (v: number) => `₦${v.toLocaleString()}`,
                },
                {
                  id: "propertiesBought",
                  title: "Property Mogul 🏢",
                  getVal: (s: any) => s.propertiesBought,
                  format: (v: number) => `${v} properties`,
                },
                {
                  id: "jailTimes",
                  title: "Jail Regular 🚔",
                  getVal: (s: any) => s.jailTimes,
                  format: (v: number) => `${v} visits`,
                },
              ];

              return awards.map((award) => {
                let topPlayer: Player | null = null;
                let topValue = 0;
                engineState.players.forEach((p) => {
                  const val = award.getVal(engineState.stats[p.id]);
                  if (val > topValue) {
                    topValue = val;
                    topPlayer = p;
                  }
                });

                if (topValue === 0) return null;
                const winner = topPlayer!;

                const token = tokenEmoji(roomState?.lobbyPlayers?.get(winner.id)?.tokenId);

                return (
                  <div
                    key={award.id}
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      padding: "0.75rem",
                      borderRadius: "var(--radius-md)",
                      borderLeft: "3px solid var(--color-gold)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {award.title}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>
                        {token} {winner.name}
                      </span>
                      <span style={{ color: "var(--color-gold)" }}>{award.format(topValue)}</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="leaderboard-container">
          <h3
            style={{
              margin: "0 0 1rem 0",
              color: "var(--color-gold)",
              textTransform: "uppercase",
              fontSize: "1rem",
              letterSpacing: "1px",
            }}
          >
            Game Summary
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            {[
              { label: "Rounds Played", value: engineState.currentTurn ?? 1 },
              {
                label: "Properties Owned",
                value: BOARD.filter((t: Tile) => engineState.tiles[t.pos]?.ownerId).length,
              },
              { label: "Players", value: engineState.players.length },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.75rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-gold)" }}>
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
          {isHost && (
            <button
              className="button-primary full-width-btn"
              style={{ padding: "1rem", flex: 2 }}
              onClick={onResetGame}
            >
              🔄 Return to Lobby
            </button>
          )}
          <button
            className="button-primary full-width-btn"
            style={{
              padding: "1rem",
              flex: 1,
              background: "var(--surface-3)",
              color: "var(--text-primary)",
            }}
            onClick={handleShare}
          >
            📤 Share
          </button>
        </div>
      </motion.div>
    </div>
  );
}
