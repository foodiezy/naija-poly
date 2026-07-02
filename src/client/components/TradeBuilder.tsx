import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { BOARD, PropertyTile } from "../../data/board";
import type { Tile } from "../../data/board";
import { GameState, Action, TradeOffer, TileState } from "../../engine/types";
import { IconTrade } from "./icons";
import { tokenEmoji } from "../../data/tokens";
import { tileValue } from "../lib/holdings";
import { RoomState } from "../../shared/room";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
  onClose: () => void;
  liveState?: RoomState | undefined;
}

function groupColorVar(tile: Tile): string {
  if (tile.type === "property") return `var(--color-${(tile as PropertyTile).group})`;
  if (tile.type === "airport") return "#9ca3af";
  if (tile.type === "utility") return "#64748b";
  return "var(--text-muted)";
}

function tileSubLabel(tile: Tile): string {
  if (tile.type === "property") return (tile as PropertyTile).group.replace(/^\w/, (c) => c.toUpperCase());
  if (tile.type === "airport") return "Airport";
  if (tile.type === "utility") return "Utility";
  return "";
}

export default function TradeBuilder({ engineState, mySessionId, onSendAction, onClose, liveState }: Props) {
  const { players, tiles } = engineState;
  const me = players.find((p) => p.id === mySessionId);

  const [tradeTargetId, setTradeTargetId] = useState("");
  const [tradeGiveCash, setTradeGiveCash] = useState(0);
  const [tradeGetCash, setTradeGetCash] = useState(0);
  const [tradeGiveTiles, setTradeGiveTiles] = useState<number[]>([]);
  const [tradeGetTiles, setTradeGetTiles] = useState<number[]>([]);

  useEffect(() => { setTradeGetTiles([]); }, [tradeTargetId]);

  const getToken = (id: string) => tokenEmoji(liveState?.lobbyPlayers?.get(id)?.tokenId);

  const tradeablePartners = players.filter((p) => p.id !== mySessionId && !p.bankrupt);

  const myTradeableTiles = useMemo(
    () => BOARD.filter((t: Tile) => tiles[t.pos]?.ownerId === mySessionId && (tiles[t.pos] as TileState).houses === 0),
    [tiles, mySessionId]
  );
  const targetTradeableTiles = useMemo(
    () => tradeTargetId
      ? BOARD.filter((t: Tile) => tiles[t.pos]?.ownerId === tradeTargetId && (tiles[t.pos] as TileState).houses === 0)
      : [],
    [tiles, tradeTargetId]
  );

  const target = players.find((p) => p.id === tradeTargetId);

  const toggle = (setter: React.Dispatch<React.SetStateAction<number[]>>, pos: number) =>
    setter((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]);

  // Bump-buttons for cash inputs
  const cashSteps = (max: number): number[] => {
    return [50_000, 100_000, 250_000, 500_000].filter((v) => v <= max);
  };

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

  // Live valuation of each side: tile value (bank assessment) + cash.
  const giveValue = tradeGiveCash + tradeGiveTiles.reduce((s, p) => s + tileValue(p, tiles), 0);
  const getValue = tradeGetCash + tradeGetTiles.reduce((s, p) => s + tileValue(p, tiles), 0);

  const isEmpty = tradeGiveTiles.length === 0 && tradeGetTiles.length === 0 && tradeGiveCash === 0 && tradeGetCash === 0;

  // Portal to <body>: the sidebar ancestor has backdrop-filter + overflow:hidden,
  // which creates a new containing block for position:fixed descendants and
  // clips this "full-screen" overlay to the sidebar's small box instead of the
  // viewport. Rendering at the body root sidesteps that entirely.
  return createPortal(
    <motion.div
      className="trade-overlay"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
    >
      <motion.div
        className="trade-card-premium"
        initial={{ scale: 0.94 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        <div className="trade-card-header">
          <div className="trade-card-title">
            <span className="trade-card-title-icon"><IconTrade size={20} /></span>
            <span>Propose a Deal</span>
          </div>
          <button className="trade-card-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="trade-card-body">
          {/* 1. Player picker */}
          <div className="trade-section">
            <div className="trade-section-label">Trade with</div>
            <div className="trade-player-grid">
              {tradeablePartners.length === 0 && (
                <div className="trade-empty-row">No other players to trade with.</div>
              )}
              {tradeablePartners.map((p) => {
                const isSelected = p.id === tradeTargetId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`trade-player-pick${isSelected ? " selected" : ""}`}
                    onClick={() => setTradeTargetId(p.id)}
                  >
                    <span className="trade-player-pick-avatar">{getToken(p.id)}</span>
                    <span className="trade-player-pick-meta">
                      <span className="trade-player-pick-name">{p.name}</span>
                      <span className="trade-player-pick-cash">₦{p.cash.toLocaleString()}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {tradeTargetId && target && (
            <>
              {/* 2. Two-column ledger: You offer / You want */}
              <div className="trade-ledger">
                {/* LEFT — what I give */}
                <div className="trade-column">
                  <div className="trade-column-head you">
                    <span className="trade-column-head-avatar">{getToken(mySessionId)}</span>
                    <span className="trade-column-head-meta">
                      <span className="trade-column-head-name">You offer</span>
                      <span className="trade-column-head-sub">{me?.name}</span>
                    </span>
                  </div>

                  <label className="trade-cash-label">Cash</label>
                  <div className="trade-cash-row">
                    <input
                      type="number"
                      className="trade-cash-input"
                      min={0}
                      max={me?.cash || 0}
                      step={10000}
                      value={tradeGiveCash || ""}
                      placeholder="0"
                      onChange={(e) => setTradeGiveCash(Math.max(0, Math.min(me?.cash || 0, Number(e.target.value))))}
                    />
                    <div className="trade-bump-row">
                      {cashSteps(me?.cash || 0).map((step) => (
                        <button
                          key={step}
                          type="button"
                          className="trade-bump"
                          onClick={() => setTradeGiveCash((c) => Math.min(me?.cash || 0, c + step))}
                        >
                          +₦{step >= 1_000_000 ? `${step / 1_000_000}M` : `${step / 1000}k`}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="trade-bump max"
                        onClick={() => setTradeGiveCash(me?.cash || 0)}
                      >Max</button>
                    </div>
                  </div>

                  <label className="trade-cash-label">Properties</label>
                  <div className="trade-tile-list">
                    {myTradeableTiles.length === 0
                      ? <div className="trade-empty-row">No unimproved properties.</div>
                      : myTradeableTiles.map((t: Tile) => {
                        const selected = tradeGiveTiles.includes(t.pos);
                        return (
                          <button
                            key={t.pos}
                            type="button"
                            className={`trade-tile-pick${selected ? " selected" : ""}`}
                            onClick={() => toggle(setTradeGiveTiles, t.pos)}
                          >
                            <span className="trade-tile-band" style={{ background: groupColorVar(t) }} />
                            <span className="trade-tile-info">
                              <span className="trade-tile-name">{t.name}</span>
                              <span className="trade-tile-sub">{tileSubLabel(t)}</span>
                            </span>
                            <span className="trade-tile-value">₦{tileValue(t.pos, tiles).toLocaleString()}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* RIGHT — what they give */}
                <div className="trade-column">
                  <div className="trade-column-head them">
                    <span className="trade-column-head-avatar">{getToken(tradeTargetId)}</span>
                    <span className="trade-column-head-meta">
                      <span className="trade-column-head-name">You ask</span>
                      <span className="trade-column-head-sub">{target.name}</span>
                    </span>
                  </div>

                  <label className="trade-cash-label">Cash</label>
                  <div className="trade-cash-row">
                    <input
                      type="number"
                      className="trade-cash-input"
                      min={0}
                      max={target.cash || 0}
                      step={10000}
                      value={tradeGetCash || ""}
                      placeholder="0"
                      onChange={(e) => setTradeGetCash(Math.max(0, Math.min(target.cash || 0, Number(e.target.value))))}
                    />
                    <div className="trade-bump-row">
                      {cashSteps(target.cash || 0).map((step) => (
                        <button
                          key={step}
                          type="button"
                          className="trade-bump"
                          onClick={() => setTradeGetCash((c) => Math.min(target.cash || 0, c + step))}
                        >
                          +₦{step >= 1_000_000 ? `${step / 1_000_000}M` : `${step / 1000}k`}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="trade-bump max"
                        onClick={() => setTradeGetCash(target.cash || 0)}
                      >Max</button>
                    </div>
                  </div>

                  <label className="trade-cash-label">Properties</label>
                  <div className="trade-tile-list">
                    {targetTradeableTiles.length === 0
                      ? <div className="trade-empty-row">They have no unimproved properties.</div>
                      : targetTradeableTiles.map((t: Tile) => {
                        const selected = tradeGetTiles.includes(t.pos);
                        return (
                          <button
                            key={t.pos}
                            type="button"
                            className={`trade-tile-pick${selected ? " selected" : ""}`}
                            onClick={() => toggle(setTradeGetTiles, t.pos)}
                          >
                            <span className="trade-tile-band" style={{ background: groupColorVar(t) }} />
                            <span className="trade-tile-info">
                              <span className="trade-tile-name">{t.name}</span>
                              <span className="trade-tile-sub">{tileSubLabel(t)}</span>
                            </span>
                            <span className="trade-tile-value">₦{tileValue(t.pos, tiles).toLocaleString()}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* 3. Live balance preview */}
              <div className="trade-balance-row">
                <div className="trade-balance-side">
                  <span className="trade-balance-label">You offer</span>
                  <span className="trade-balance-value">₦{giveValue.toLocaleString()}</span>
                </div>
                <div className="trade-balance-side right">
                  <span className="trade-balance-label">You receive</span>
                  <span className="trade-balance-value">₦{getValue.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="trade-card-actions">
          <button className="trade-action-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="trade-action-btn propose"
            disabled={!tradeTargetId || isEmpty}
            onClick={handlePropose}
          >
            <IconTrade size={16} /> Send Offer
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
