import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Room } from "colyseus.js";
import { GameState, Action } from "../../engine/types";
import { tokenEmoji } from "../../data/tokens";
import { tokenName } from "../../data/tokens";
import { RoomState } from "../../shared/room";
import { netWorth } from "../lib/holdings";
import { IconTimer, IconBankrupt, IconWarning } from "./icons";
import PlayerList from "./PlayerList";
import AuctionPanel from "./AuctionPanel";
import ActionButtons from "./ActionButtons";
import PropertyList from "./PropertyList";
import TradeOverlay from "./TradeOverlay";
import TradeBuilder from "./TradeBuilder";

interface ControlPanelProps {
  room: Room;
  engineState: GameState;
  onSendAction: (action: Action) => void;
  autoEndTurn?: boolean;
  onToggleAutoEndTurn?: () => void;
  turnDeadline?: number;
  turnTimeoutSecs?: number;
}

export default function ControlPanel({
  room, engineState, onSendAction, autoEndTurn, onToggleAutoEndTurn, turnDeadline, turnTimeoutSecs,
}: ControlPanelProps) {
  const [showTradeBuilder, setShowTradeBuilder] = useState(false);
  const [now, setNow] = useState(Date.now());

  const mySessionId = room.sessionId;
  const liveState = room.state as RoomState | undefined;

  const { players, currentPlayerIndex, phase, auctionState, activeTrade } = engineState;
  const currentPlayer = players[currentPlayerIndex];
  const me = players.find((p) => p.id === mySessionId);
  const isMyTurn = currentPlayer?.id === mySessionId;
  const isBankrupt = me?.bankrupt;
  const isAuctionActive = phase === "auction" && !!auctionState;
  const canManage = isMyTurn && (phase === "awaiting-roll" || phase === "awaiting-end-turn");

  // Tick for the per-turn AFK timer
  useEffect(() => {
    if (!turnDeadline || turnDeadline <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [turnDeadline]);

  // Reset trade builder when turn or phase changes
  useEffect(() => { setShowTradeBuilder(false); }, [currentPlayerIndex, phase]);

  const turnMsLeft = turnDeadline && turnDeadline > 0 ? Math.max(0, turnDeadline - now) : 0;
  const turnSecsLeft = Math.ceil(turnMsLeft / 1000);
  const turnPct = turnDeadline && turnDeadline > 0 && turnTimeoutSecs
    ? Math.max(0, Math.min(100, (turnMsLeft / (turnTimeoutSecs * 1000)) * 100))
    : 0;

  const myToken = liveState?.lobbyPlayers?.get(mySessionId);
  const myNetWorth = netWorth(me?.cash ?? 0, engineState.tiles, mySessionId);

  return (
    <div className="console-panel glass-panel" style={{ padding: 0, overflow: "hidden" }}>
      {/* Trade overlays (animated modals) */}
      <AnimatePresence>
        {activeTrade && (
          <TradeOverlay
            key="trade-response"
            activeTrade={activeTrade}
            players={players}
            tiles={engineState.tiles}
            mySessionId={mySessionId}
            onSendAction={onSendAction}
            liveState={liveState}
          />
        )}
        {showTradeBuilder && (
          <TradeBuilder
            key="trade-builder"
            engineState={engineState}
            mySessionId={mySessionId}
            onSendAction={onSendAction}
            onClose={() => setShowTradeBuilder(false)}
            liveState={liveState}
          />
        )}
      </AnimatePresence>

      {/* 1. Player roster */}
      <PlayerList engineState={engineState} mySessionId={mySessionId} liveState={liveState} />

      {/* Per-turn AFK countdown */}
      {isMyTurn && !isBankrupt && !isAuctionActive && turnDeadline && turnDeadline > 0 && (
        <div style={{ padding: "0.5rem 1rem", background: "rgba(16,185,129,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.3rem", fontWeight: 600 }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}><IconTimer size={14} /> Turn timer</span>
            <span style={{ fontWeight: "bold", color: turnPct < 20 ? "var(--color-danger)" : turnPct < 50 ? "var(--color-gold)" : "var(--color-naira)" }}>{turnSecsLeft}s</span>
          </div>
          <div style={{ height: "6px", background: "rgba(0,0,0,0.4)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ width: `${turnPct}%`, height: "100%", background: turnPct < 20 ? "var(--color-danger)" : turnPct < 50 ? "var(--color-gold)" : "var(--color-naira)", transition: "width 0.25s linear" }} />
          </div>
        </div>
      )}

      {/* 2. My player card */}
      <div className="sidebar-player-card" style={{ background: "rgba(0,0,0,0.15)", margin: 0, borderBottom: "1px solid rgba(255,255,255,0.05)", borderRadius: 0 }}>
        <div className="sidebar-player-avatar">{me ? tokenEmoji(myToken?.tokenId) : "👤"}</div>
        <div className="sidebar-player-name">{me?.name || "—"}</div>
        <div className="sidebar-player-token-label">Token: {me ? tokenName(myToken?.tokenId) : "—"}</div>
        <div className="sidebar-player-balance">₦{(me?.cash ?? 0).toLocaleString()}</div>
        <div className="sidebar-player-meta" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", width: "100%", marginTop: "0.4rem", fontSize: "0.7rem", color: "var(--text-muted)" }}>
          <span>Net worth <strong style={{ color: "var(--text-secondary)" }}>₦{myNetWorth.toLocaleString()}</strong></span>
          <span>Round <strong style={{ color: "var(--text-secondary)" }}>{engineState.currentTurn ?? 1}{engineState.settings?.turnLimit > 0 ? ` / ${engineState.settings.turnLimit}` : ""}</strong></span>
        </div>
      </div>

      {/* 3. Auction panel */}
      <AnimatePresence>
        {isAuctionActive && auctionState && (
          <AuctionPanel
            auction={auctionState}
            players={players}
            mySessionId={mySessionId}
            myCash={me?.cash ?? 0}
            onSendAction={onSendAction}
          />
        )}
      </AnimatePresence>

      {/* Bankruptcy warning */}
      {me && me.cash < 0 && !isBankrupt && (
        <div style={{ margin: "0.75rem", padding: "0.5rem", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "2px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-danger)", textAlign: "center", fontWeight: "bold", marginBottom: "0.3rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
            <IconWarning size={16} /> DEBT: ₦{me.cash.toLocaleString()}
          </div>
          <button
            className="button-primary"
            style={{ width: "100%", background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", fontSize: "0.75rem", padding: "0.4rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", borderRadius: "2px" }}
            onClick={() => { if (window.confirm("Declare bankruptcy? You will lose everything.")) onSendAction({ type: "DECLARE_BANKRUPT" }); }}
          >
            Declare Bankruptcy <IconBankrupt size={16} />
          </button>
        </div>
      )}

      {/* Trade pending notices */}
      {activeTrade && activeTrade.fromId === mySessionId && (
        <div style={{ margin: "0.75rem", padding: "0.4rem", fontSize: "0.72rem", textAlign: "center", color: "var(--text-secondary)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "2px", background: "rgba(245,158,11,0.03)" }}>
          🤝 Waiting for trade response...
        </div>
      )}
      {activeTrade && activeTrade.fromId !== mySessionId && activeTrade.toId !== mySessionId && (
        <div style={{ margin: "0.75rem", padding: "0.4rem", fontSize: "0.72rem", textAlign: "center", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", borderRadius: "2px" }}>
          🤝 Trade in progress...
        </div>
      )}

      {/* 4. Action buttons */}
      <div className="sidebar-actions" style={{ padding: "0.75rem 1rem", background: "#1c1835", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {!isAuctionActive && (
          <ActionButtons
            engineState={engineState}
            me={me}
            mySessionId={mySessionId}
            isMyTurn={isMyTurn}
            canManage={canManage}
            activeTrade={activeTrade ?? null}
            onSendAction={onSendAction}
            onShowTradeBuilder={() => setShowTradeBuilder(true)}
          />
        )}
      </div>

      {/* Auto End Turn toggle */}
      {!isBankrupt && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 1rem", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer", fontWeight: 600 }}>
            <input type="checkbox" checked={!!autoEndTurn} onChange={onToggleAutoEndTurn} style={{ cursor: "pointer" }} />
            Auto End Turn
          </label>
          {autoEndTurn && isMyTurn && phase === "awaiting-end-turn" && (me?.cash ?? 0) >= 0 && (
            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontStyle: "italic" }}>⏳ auto ~2s</span>
          )}
        </div>
      )}

      {/* 5. My properties */}
      <PropertyList
        engineState={engineState}
        mySessionId={mySessionId}
        canManage={canManage}
        onSendAction={onSendAction}
      />
    </div>
  );
}
