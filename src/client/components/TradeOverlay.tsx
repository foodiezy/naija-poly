import { motion } from "framer-motion";
import { BOARD } from "../../data/board";
import { TradeOffer, Player, Action, TileState } from "../../engine/types";
import { IconTrade } from "./icons";

interface Props {
  activeTrade: TradeOffer;
  players: Player[];
  tiles: Record<number, TileState>;
  mySessionId: string;
  onSendAction: (action: Action) => void;
}

function tileNamesStr(posArray: number[]): string {
  if (posArray.length === 0) return "None";
  return posArray.map((pos) => BOARD[pos].name).join(", ");
}

export default function TradeOverlay({ activeTrade, players, tiles, mySessionId, onSendAction }: Props) {
  if (activeTrade.toId !== mySessionId) return null;

  const proposer = players.find((p) => p.id === activeTrade.fromId);

  const summary = `You RECEIVE: ₦${activeTrade.giveCash.toLocaleString()} + ${tileNamesStr(activeTrade.giveTiles)}\nYou GIVE: ₦${activeTrade.getCash.toLocaleString()} + ${tileNamesStr(activeTrade.getTiles)}`;

  // suppress unused lint for tiles (available for future detail display)
  void tiles;

  return (
    <motion.div
      className="trade-overlay"
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      <div className="trade-card glass-panel" style={{ border: "2px solid var(--color-gold)", background: "#0e1525" }}>
        <h3 className="auction-title" style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <IconTrade size={22} /> Incoming Trade Offer
        </h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", textAlign: "center" }}>
          <strong>{proposer?.name}</strong> proposed a trade deal to you!
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", background: "rgba(0,0,0,0.3)", padding: "1rem", borderRadius: "8px" }}>
          <div>
            <strong style={{ color: "var(--color-naira)" }}>You will receive:</strong>
            <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
              <div>Cash: ₦{activeTrade.giveCash.toLocaleString()}</div>
              <div style={{ color: "var(--text-secondary)" }}>Properties: {tileNamesStr(activeTrade.giveTiles)}</div>
            </div>
          </div>
          <div>
            <strong style={{ color: "var(--color-danger)" }}>You will give:</strong>
            <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
              <div>Cash: ₦{activeTrade.getCash.toLocaleString()}</div>
              <div style={{ color: "var(--text-secondary)" }}>Properties: {tileNamesStr(activeTrade.getTiles)}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
          <button
            className="button-primary"
            style={{ flex: 1, background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
            onClick={() => {
              if (window.confirm(`Accept this trade?\n\n${summary}`)) {
                onSendAction({ type: "RESPOND_TRADE", accept: true });
              }
            }}
          >
            Accept Offer
          </button>
          <button
            className="button-secondary"
            style={{ flex: 1, background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" }}
            onClick={() => onSendAction({ type: "RESPOND_TRADE", accept: false })}
          >
            Decline Offer
          </button>
        </div>
      </div>
    </motion.div>
  );
}
