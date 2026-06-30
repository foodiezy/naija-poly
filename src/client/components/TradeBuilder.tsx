import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BOARD } from "../../data/board";
import type { Tile } from "../../data/board";
import { GameState, Player, Action, TradeOffer, TileState } from "../../engine/types";
import { IconTrade } from "./icons";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
  onClose: () => void;
}

export default function TradeBuilder({ engineState, mySessionId, onSendAction, onClose }: Props) {
  const { players, tiles } = engineState;
  const me = players.find((p) => p.id === mySessionId);

  const [tradeTargetId, setTradeTargetId] = useState("");
  const [tradeGiveCash, setTradeGiveCash] = useState(0);
  const [tradeGetCash, setTradeGetCash] = useState(0);
  const [tradeGiveTiles, setTradeGiveTiles] = useState<number[]>([]);
  const [tradeGetTiles, setTradeGetTiles] = useState<number[]>([]);

  // Reset when target changes
  useEffect(() => { setTradeGetTiles([]); }, [tradeTargetId]);

  const myProperties = BOARD.filter((t: Tile) => tiles[t.pos]?.ownerId === mySessionId && (tiles[t.pos] as TileState).houses === 0);
  const targetProperties = tradeTargetId
    ? BOARD.filter((t: Tile) => tiles[t.pos]?.ownerId === tradeTargetId && (tiles[t.pos] as TileState).houses === 0)
    : [];

  const target = players.find((p) => p.id === tradeTargetId);

  const toggle = (setter: React.Dispatch<React.SetStateAction<number[]>>, pos: number) =>
    setter((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]);

  const handlePropose = () => {
    if (!tradeTargetId) return;
    const trade: TradeOffer = {
      fromId: mySessionId,
      toId: tradeTargetId,
      giveCash: Number(tradeGiveCash) || 0,
      getCash: Number(tradeGetCash) || 0,
      giveTiles: tradeGiveTiles,
      getTiles: tradeGetTiles,
    };
    onSendAction({ type: "PROPOSE_TRADE", trade });
    onClose();
  };

  const isEmpty = tradeGiveTiles.length === 0 && tradeGetTiles.length === 0 && tradeGiveCash === 0 && tradeGetCash === 0;

  return (
    <motion.div
      className="trade-overlay"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
    >
      <div className="trade-card glass-panel" style={{ background: "#0e1525", maxWidth: "550px", overflowY: "auto", maxHeight: "90vh" }}>
        <h3 className="auction-title" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <IconTrade size={22} /> Propose Trade Deal
        </h3>

        <div className="form-group">
          <label>Select Player to Trade With:</label>
          <select className="input-field" value={tradeTargetId} onChange={(e) => setTradeTargetId(e.target.value)}>
            <option value="">-- Choose Player --</option>
            {players.filter((p: Player) => p.id !== mySessionId && !p.bankrupt).map((p: Player) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {tradeTargetId && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
              <div className="form-group">
                <label>You Offer Cash (₦):</label>
                <input type="number" className="input-field" min={0} max={me?.cash || 0} step={10000} value={tradeGiveCash} onChange={(e) => setTradeGiveCash(Math.max(0, Number(e.target.value)))} />
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Max: ₦{me?.cash.toLocaleString()}</span>
              </div>
              <div className="form-group">
                <label>You Ask Cash (₦):</label>
                <input type="number" className="input-field" min={0} max={target?.cash || 0} step={10000} value={tradeGetCash} onChange={(e) => setTradeGetCash(Math.max(0, Number(e.target.value)))} />
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Max: ₦{target?.cash.toLocaleString()}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-secondary)" }}>Give Properties:</label>
                <div style={{ maxHeight: "120px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "6px", marginTop: "0.25rem" }}>
                  {myProperties.length === 0
                    ? <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" }}>No unimproved properties</div>
                    : myProperties.map((t: Tile) => (
                      <label key={t.pos} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", margin: "4px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={tradeGiveTiles.includes(t.pos)} onChange={() => toggle(setTradeGiveTiles, t.pos)} />
                        <span>{t.name}</span>
                      </label>
                    ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-secondary)" }}>Request Properties:</label>
                <div style={{ maxHeight: "120px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "6px", marginTop: "0.25rem" }}>
                  {targetProperties.length === 0
                    ? <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" }}>No unimproved properties</div>
                    : targetProperties.map((t: Tile) => (
                      <label key={t.pos} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", margin: "4px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={tradeGetTiles.includes(t.pos)} onChange={() => toggle(setTradeGetTiles, t.pos)} />
                        <span>{t.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
          <button className="button-primary" disabled={!tradeTargetId || isEmpty} onClick={handlePropose} style={{ flex: 1 }}>
            Propose Deal
          </button>
          <button className="button-secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}
