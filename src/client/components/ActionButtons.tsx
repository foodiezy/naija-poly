import { motion } from "framer-motion";
import { BOARD } from "../../data/board";
import { GameState, Player, Action, TradeOffer } from "../../engine/types";
import { IconRoll, IconTrade } from "./icons";

interface Props {
  engineState: GameState;
  me: Player | undefined;
  mySessionId: string;
  isMyTurn: boolean;
  canManage: boolean;
  activeTrade: TradeOffer | null;
  onSendAction: (action: Action) => void;
  onShowTradeBuilder: () => void;
}

export default function ActionButtons({
  engineState, me, mySessionId, isMyTurn, canManage, activeTrade, onSendAction, onShowTradeBuilder,
}: Props) {
  const { phase, players } = engineState;
  const currentPlayer = players[engineState.currentPlayerIndex];
  const isBankrupt = me?.bankrupt;

  if (isBankrupt) {
    return <div style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.25rem" }}>💀 Spectating</div>;
  }

  const tradeBtn = (
    <button
      className="sidebar-action-btn sidebar-action-btn-outline"
      onClick={onShowTradeBuilder}
      disabled={!canManage || players.length < 2 || activeTrade !== null}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem", borderRadius: "2px" }}
    >
      <IconTrade size={16} /> Trade
    </button>
  );

  if (phase === "awaiting-roll" && isMyTurn) {
    if (me?.inJail) {
      return (
        <>
          <button className="sidebar-action-btn sidebar-action-btn-primary" onClick={() => onSendAction({ type: "ROLL" })} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", borderRadius: "2px" }}>
            <IconRoll size={18} /> Roll
          </button>
          <button className="sidebar-action-btn sidebar-action-btn-outline" onClick={() => onSendAction({ type: "PAY_JAIL_FINE" })} disabled={(me?.cash || 0) < 50000} title="Pay ₦50,000" style={{ borderRadius: "2px" }}>
            Pay Fine
          </button>
          <button className="sidebar-action-btn sidebar-action-btn-outline" onClick={() => onSendAction({ type: "USE_JAIL_CARD" })} disabled={(me?.jailCardSources?.length || 0) === 0} title={`Jail cards: ${me?.jailCardSources?.length || 0}`} style={{ borderRadius: "2px" }}>
            Jail Card
          </button>
        </>
      );
    }
    return (
      <>
        <motion.button
          className="sidebar-action-btn sidebar-action-btn-primary"
          onClick={() => onSendAction({ type: "ROLL" })}
          whileTap={{ scale: 0.94 }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", borderRadius: "2px", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", boxShadow: "0 4px 12px rgba(16,185,129,0.25)" }}
        >
          <IconRoll size={18} /> Roll Dice
        </motion.button>
        {tradeBtn}
      </>
    );
  }

  if (phase === "awaiting-buy-decision" && isMyTurn) {
    const tile = me ? BOARD[me.position] : undefined;
    const price = tile && "price" in tile ? tile.price : 0;
    return (
      <>
        <button className="sidebar-action-btn sidebar-action-btn-primary" disabled={(me?.cash || 0) < price} onClick={() => onSendAction({ type: "BUY" })} style={{ borderRadius: "2px", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
          Buy ₦{(price / 1000).toFixed(0)}k
        </button>
        <button className="sidebar-action-btn sidebar-action-btn-outline" onClick={() => onSendAction({ type: "DECLINE_BUY" })} style={{ borderRadius: "2px" }}>
          Auction
        </button>
      </>
    );
  }

  if (phase === "awaiting-end-turn" && isMyTurn) {
    return tradeBtn;
  }

  if (!isMyTurn) {
    return (
      <div style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.25rem" }}>
        ⏳ Waiting for {currentPlayer?.name || "—"}
      </div>
    );
  }

  // suppress unused warning — mySessionId is passed for future use
  void mySessionId;
  return null;
}
