import { motion } from "framer-motion";
import { BOARD, PropertyTile, AirportTile, UtilityTile } from "../../data/board";
import { GameState, Action, Player } from "../../engine/types";
import { IconAuction } from "./icons";
import TileImage from "./TileImage";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
}

const groupColorMap: Record<string, string> = {
  brown: "var(--color-brown)",
  lightblue: "var(--color-lightblue)",
  pink: "var(--color-pink)",
  orange: "var(--color-orange)",
  red: "var(--color-red)",
  yellow: "var(--color-yellow)",
  green: "var(--color-green)",
  darkblue: "var(--color-darkblue)",
};

export default function BuyDeedModal({ engineState, mySessionId, onSendAction }: Props) {
  const { phase, players, currentPlayerIndex, tiles } = engineState;
  const currentPlayer: Player | undefined = players[currentPlayerIndex];
  if (phase !== "awaiting-buy-decision" || !currentPlayer || currentPlayer.id !== mySessionId) {
    return null;
  }

  const tile = BOARD[currentPlayer.position];
  if (!tile || !("price" in tile)) return null;

  const price = tile.price;
  const canAfford = currentPlayer.cash >= price;

  const headerColor =
    tile.type === "property"
      ? groupColorMap[(tile as PropertyTile).group] || "#444"
      : tile.type === "airport"
        ? "#1f2937"
        : "#334155";

  const handleBuy = () => onSendAction({ type: "BUY" });
  const handleAuction = () => onSendAction({ type: "DECLINE_BUY" });

  // Compute "would own full group" preview for property
  const ownsFullGroupAfterBuy =
    tile.type === "property"
      ? BOARD.filter(
          (bt): bt is PropertyTile =>
            bt.type === "property" && bt.group === (tile as PropertyTile).group,
        ).every((gt) => gt.pos === tile.pos || tiles?.[gt.pos]?.ownerId === currentPlayer.id)
      : false;

  return (
    <motion.div
      className="buy-deed-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="buy-deed-card"
        initial={{ scale: 0.6, opacity: 0, rotateY: -90 }}
        animate={{ scale: 1, opacity: 1, rotateY: 0 }}
        exit={{ scale: 0.85, opacity: 0, rotateY: 30 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      >
        <div className="buy-deed-photo-wrap">
          <TileImage pos={currentPlayer.position} className="buy-deed-photo" />
          <div className="buy-deed-photo-scrim" />
          <div className="buy-deed-landed-pill">You landed on</div>
        </div>

        <div className="buy-deed-header" style={{ background: headerColor }}>
          <div className="buy-deed-title">
            {tile.type === "property" && "TITLE DEED"}
            {tile.type === "airport" && "✈️  AIRPORT"}
            {tile.type === "utility" && "⚡  UTILITY"}
          </div>
          <div className="buy-deed-name">{tile.name}</div>
        </div>

        <div className="buy-deed-body">
          {tile.type === "property" && (
            <>
              <div className="buy-deed-rent-grid">
                <div className="buy-deed-rent-row base">
                  <span>Rent</span>
                  <span>₦{(tile as PropertyTile).rent[0].toLocaleString()}</span>
                </div>
                {ownsFullGroupAfterBuy && (
                  <div className="buy-deed-bonus-row">
                    🔥 Completes the {(tile as PropertyTile).group} set — rent doubled!
                  </div>
                )}
                {["Bungalow", "Duplex", "Mansion", "Estate", "Hotel"].map((label, i) => (
                  <div key={i} className="buy-deed-rent-row">
                    <span>+ {label}</span>
                    <span>₦{(tile as PropertyTile).rent[i + 1].toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="buy-deed-meta">
                Building cost ₦{(tile as PropertyTile).houseCost.toLocaleString()} · Mortgage ₦
                {(tile as PropertyTile).mortgage.toLocaleString()}
              </div>
            </>
          )}

          {tile.type === "airport" && (
            <div className="buy-deed-rent-grid">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="buy-deed-rent-row">
                  <span>{n} owned</span>
                  <span>₦{(tile as AirportTile).rent[n - 1].toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {tile.type === "utility" && (
            <div className="buy-deed-rent-grid">
              <div className="buy-deed-rent-row">
                <span>1 owned</span>
                <span>Dice × {(tile as UtilityTile).multiplier[0]}</span>
              </div>
              <div className="buy-deed-rent-row">
                <span>2 owned</span>
                <span>Dice × {(tile as UtilityTile).multiplier[1]}</span>
              </div>
            </div>
          )}

          <div className="buy-deed-price-block">
            <div className="buy-deed-price-label">Asking Price</div>
            <div className="buy-deed-price-value">₦{price.toLocaleString()}</div>
            <div className="buy-deed-cash-row">
              <span>Your cash</span>
              <strong className={canAfford ? "ok" : "short"}>
                ₦{currentPlayer.cash.toLocaleString()}
              </strong>
            </div>
          </div>

          <div className="buy-deed-actions">
            <motion.button
              className="buy-deed-btn buy"
              onClick={handleBuy}
              disabled={!canAfford}
              whileHover={canAfford ? { scale: 1.03 } : {}}
              whileTap={canAfford ? { scale: 0.96 } : {}}
              title={canAfford ? `Pay ₦${price.toLocaleString()}` : "Not enough cash"}
            >
              <span style={{ fontSize: "1.1rem" }}>💰</span>
              {canAfford ? `Buy for ₦${(price / 1000).toFixed(0)}k` : "Can't afford"}
            </motion.button>
            <motion.button
              className="buy-deed-btn auction"
              onClick={handleAuction}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
            >
              <IconAuction size={18} />
              Send to Auction
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
