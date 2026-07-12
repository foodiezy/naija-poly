import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { BOARD, PropertyTile } from "../../data/board";
import type { Tile } from "../../data/board";
import { TradeOffer, Player, Action, TileState } from "../../engine/types";
import { IconTrade } from "./icons";
import { tokenEmoji } from "../../data/tokens";
import { tileValue } from "../lib/holdings";
import { RoomState } from "../../shared/room";

interface Props {
  activeTrade: TradeOffer;
  players: Player[];
  tiles: Record<number, TileState>;
  mySessionId: string;
  onSendAction: (action: Action) => void;
  liveState?: RoomState | undefined;
  onCounterOffer?: (reversedTrade: TradeOffer) => void;
}

function groupColorVar(tile: Tile): string {
  if (tile.type === "property") return `var(--color-${(tile as PropertyTile).group})`;
  if (tile.type === "airport") return "#9ca3af";
  if (tile.type === "utility") return "#64748b";
  return "var(--text-muted)";
}

function tileSubLabel(tile: Tile): string {
  if (tile.type === "property")
    return (tile as PropertyTile).group.replace(/^\w/, (c) => c.toUpperCase());
  if (tile.type === "airport") return "Airport";
  if (tile.type === "utility") return "Utility";
  return "";
}

export default function TradeOverlay({
  activeTrade,
  players,
  tiles,
  mySessionId,
  onSendAction,
  liveState,
  onCounterOffer,
}: Props) {
  if (activeTrade.toId !== mySessionId) return null;

  const proposer = players.find((p) => p.id === activeTrade.fromId);
  const me = players.find((p) => p.id === mySessionId);
  const getToken = (id: string) => tokenEmoji(liveState?.lobbyPlayers?.get(id)?.tokenId);

  // From your POV: giveCash/giveTiles is what THEY are sending you; getCash/getTiles is what they want FROM you.
  const incomingCash = activeTrade.giveCash;
  const incomingTilesPositions = activeTrade.giveTiles;
  const outgoingCash = activeTrade.getCash;
  const outgoingTilesPositions = activeTrade.getTiles;

  const incomingValue =
    incomingCash + incomingTilesPositions.reduce((s, p) => s + tileValue(p, tiles), 0);
  const outgoingValue =
    outgoingCash + outgoingTilesPositions.reduce((s, p) => s + tileValue(p, tiles), 0);
  const canAfford = (me?.cash ?? 0) >= outgoingCash;

  const renderTile = (pos: number) => {
    const t = BOARD[pos];
    return (
      <div key={pos} className="trade-tile-pick selected static">
        <span className="trade-tile-band" style={{ background: groupColorVar(t) }} />
        <span className="trade-tile-info">
          <span className="trade-tile-name">{t.name}</span>
          <span className="trade-tile-sub">{tileSubLabel(t)}</span>
        </span>
        <span className="trade-tile-value">₦{tileValue(pos, tiles).toLocaleString()}</span>
      </div>
    );
  };

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
        className="trade-card-premium incoming"
        initial={{ scale: 0.94 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        <div className="trade-card-header">
          <div className="trade-card-title">
            <span className="trade-card-title-icon">
              <IconTrade size={20} />
            </span>
            <span>Incoming Trade</span>
          </div>
        </div>

        <div className="trade-card-body">
          <div className="trade-incoming-from">
            <span className="trade-incoming-from-avatar">{getToken(activeTrade.fromId)}</span>
            <div className="trade-incoming-from-meta">
              <span className="trade-incoming-from-name">{proposer?.name}</span>
              <span className="trade-incoming-from-sub">sent you a deal</span>
            </div>
          </div>

          <div className="trade-ledger">
            <div className="trade-column">
              <div className="trade-column-head you">
                <span className="trade-column-head-avatar">📥</span>
                <span className="trade-column-head-meta">
                  <span className="trade-column-head-name">You receive</span>
                </span>
              </div>
              <div className="trade-cash-display">
                <span>Cash</span>
                <strong>₦{incomingCash.toLocaleString()}</strong>
              </div>
              <label className="trade-cash-label">Properties</label>
              <div className="trade-tile-list">
                {incomingTilesPositions.length === 0 ? (
                  <div className="trade-empty-row">No properties.</div>
                ) : (
                  incomingTilesPositions.map(renderTile)
                )}
              </div>
            </div>

            <div className="trade-column">
              <div className="trade-column-head them">
                <span className="trade-column-head-avatar">📤</span>
                <span className="trade-column-head-meta">
                  <span className="trade-column-head-name">You give</span>
                </span>
              </div>
              <div className="trade-cash-display">
                <span>Cash</span>
                <strong className={canAfford ? "" : "short"}>
                  ₦{outgoingCash.toLocaleString()}
                </strong>
              </div>
              <label className="trade-cash-label">Properties</label>
              <div className="trade-tile-list">
                {outgoingTilesPositions.length === 0 ? (
                  <div className="trade-empty-row">No properties.</div>
                ) : (
                  outgoingTilesPositions.map(renderTile)
                )}
              </div>
            </div>
          </div>

          <div className="trade-balance-row">
            <div className="trade-balance-side">
              <span className="trade-balance-label">Incoming value</span>
              <span className="trade-balance-value">₦{incomingValue.toLocaleString()}</span>
            </div>
            <div className="trade-balance-side right">
              <span className="trade-balance-label">Outgoing value</span>
              <span className="trade-balance-value">₦{outgoingValue.toLocaleString()}</span>
            </div>
          </div>

          {!canAfford && (
            <div className="trade-cant-afford">
              You can't cover the ₦{outgoingCash.toLocaleString()} cash — current balance ₦
              {(me?.cash ?? 0).toLocaleString()}.
            </div>
          )}
        </div>

        <div className="trade-card-actions">
          <button
            className="trade-action-btn cancel danger"
            onClick={() => onSendAction({ type: "RESPOND_TRADE", accept: false })}
          >
            Decline
          </button>
          {onCounterOffer && (
            <button
              className="trade-action-btn cancel"
              style={{ background: "var(--color-gold)", color: "#000", border: "none" }}
              onClick={() => {
                onSendAction({ type: "RESPOND_TRADE", accept: false });
                onCounterOffer({
                  fromId: mySessionId,
                  toId: activeTrade.fromId,
                  giveCash: activeTrade.getCash,
                  getCash: activeTrade.giveCash,
                  giveTiles: activeTrade.getTiles,
                  getTiles: activeTrade.giveTiles,
                });
              }}
            >
              Counter Offer
            </button>
          )}
          <button
            className="trade-action-btn propose"
            disabled={!canAfford}
            onClick={() => onSendAction({ type: "RESPOND_TRADE", accept: true })}
          >
            Accept Deal
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
