import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Room } from "colyseus.js";
import { GameState, Action, TradeOffer } from "../../engine/types";
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
import DebtRescueModal from "./DebtRescueModal";

interface ControlPanelProps {
  room: Room;
  engineState: GameState;
  onSendAction: (action: Action) => void;
  autoEndTurn?: boolean;
  onToggleAutoEndTurn?: () => void;
  turnDeadline?: number;
  turnTimeoutSecs?: number;
  onOpenTile?: (pos: number) => void;
  // Reports when a trade/debt composer is open so App can pause auto-end-turn.
  onComposerOpenChange?: (open: boolean) => void;
  myTokenWalking?: boolean;
}

export default function ControlPanel({
  room,
  engineState,
  onSendAction,
  autoEndTurn,
  onToggleAutoEndTurn,
  turnDeadline,
  turnTimeoutSecs,
  onOpenTile,
  onComposerOpenChange,
  myTokenWalking,
}: ControlPanelProps) {
  const [showTradeBuilder, setShowTradeBuilder] = useState(false);
  const [initialTradeOffer, setInitialTradeOffer] = useState<TradeOffer | undefined>(undefined);
  // When set, the builder was opened to counter this incoming trade: sending
  // goes through RESPOND_TRADE{counter} instead of PROPOSE_TRADE.
  const [counterMode, setCounterMode] = useState(false);
  const [showDebtRescue, setShowDebtRescue] = useState(false);
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
  // Rent owed to the ledger while short on cash — the debtor must raise money
  // (or go bankrupt) before their turn can end.
  const myLedgerDebt = (engineState.debtLedger ?? [])
    .filter((d) => d.debtorId === mySessionId)
    .reduce((sum, d) => sum + d.amount, 0);
  const inDebt = !isBankrupt && me !== undefined && (me.cash < 0 || myLedgerDebt > 0);

  // Tick for the per-turn AFK timer
  useEffect(() => {
    if (!turnDeadline || turnDeadline <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [turnDeadline]);

  // Close a normal (proposing) builder when the turn moves on. A counter
  // composer survives turn changes — the offer it answers does too — and
  // closes only when that offer disappears (cancelled/resolved elsewhere).
  useEffect(() => {
    if (!counterMode) {
      setShowTradeBuilder(false);
      setInitialTradeOffer(undefined);
    }
  }, [currentPlayerIndex, counterMode]);
  useEffect(() => {
    if (counterMode && !activeTrade) {
      setShowTradeBuilder(false);
      setInitialTradeOffer(undefined);
      setCounterMode(false);
    }
  }, [activeTrade, counterMode]);

  // Debt rescue is done when the debt is gone (auto-settled or paid).
  useEffect(() => {
    if (showDebtRescue && !inDebt) setShowDebtRescue(false);
  }, [showDebtRescue, inDebt]);

  // Let App pause auto-end-turn while any composer is open.
  useEffect(() => {
    onComposerOpenChange?.(showTradeBuilder || showDebtRescue);
  }, [showTradeBuilder, showDebtRescue, onComposerOpenChange]);

  const turnMsLeft = turnDeadline && turnDeadline > 0 ? Math.max(0, turnDeadline - now) : 0;
  const turnSecsLeft = Math.ceil(turnMsLeft / 1000);
  const turnPct =
    turnDeadline && turnDeadline > 0 && turnTimeoutSecs
      ? Math.max(0, Math.min(100, (turnMsLeft / (turnTimeoutSecs * 1000)) * 100))
      : 0;

  const myToken = liveState?.lobbyPlayers?.get(mySessionId);
  const myNetWorth = netWorth(me?.cash ?? 0, engineState.tiles, mySessionId);

  return (
    <div className="console-panel glass-panel" style={{ padding: 0, overflow: "hidden" }}>
      {/* Trade overlays (animated modals) */}
      <AnimatePresence>
        {activeTrade && !showTradeBuilder && (
          <TradeOverlay
            key="trade-response"
            activeTrade={activeTrade}
            players={players}
            tiles={engineState.tiles}
            mySessionId={mySessionId}
            onSendAction={onSendAction}
            liveState={liveState}
            onCounterOffer={(reversedTrade) => {
              // The original offer stays on the table while the counter is
              // composed; sending the counter answers it in one engine action.
              setInitialTradeOffer(reversedTrade);
              setCounterMode(true);
              setShowTradeBuilder(true);
            }}
          />
        )}
        {showTradeBuilder && (
          <TradeBuilder
            key="trade-builder"
            engineState={engineState}
            mySessionId={mySessionId}
            onSendAction={onSendAction}
            onClose={() => {
              setShowTradeBuilder(false);
              setInitialTradeOffer(undefined);
              setCounterMode(false);
            }}
            liveState={liveState}
            initialOffer={initialTradeOffer}
            counterMode={counterMode}
          />
        )}
        {showDebtRescue && me && (
          <DebtRescueModal
            key="debt-rescue"
            engineState={engineState}
            me={me}
            ledgerDebt={myLedgerDebt}
            onSendAction={onSendAction}
            onClose={() => setShowDebtRescue(false)}
            onOpenTrade={() => setShowTradeBuilder(true)}
          />
        )}
      </AnimatePresence>

      {/* 1. Player roster */}
      <PlayerList
        engineState={engineState}
        mySessionId={mySessionId}
        liveState={liveState}
        onSendAction={onSendAction}
      />

      {/* Per-turn AFK countdown */}
      {isMyTurn && !isBankrupt && !isAuctionActive && turnDeadline && turnDeadline > 0 && (
        <div
          style={{
            padding: "0.5rem 1rem",
            background: "rgba(70,199,141,0.05)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.7rem",
              color: "var(--text-secondary)",
              marginBottom: "0.3rem",
              fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <IconTimer size={14} /> Turn timer
            </span>
            <span
              style={{
                fontWeight: "bold",
                color:
                  turnPct < 20
                    ? "var(--color-danger)"
                    : turnPct < 50
                      ? "var(--color-gold)"
                      : "var(--color-naira)",
              }}
            >
              {turnSecsLeft}s
            </span>
          </div>
          <div
            style={{
              height: "6px",
              background: "rgba(0,0,0,0.4)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${turnPct}%`,
                height: "100%",
                background:
                  turnPct < 20
                    ? "var(--color-danger)"
                    : turnPct < 50
                      ? "var(--color-gold)"
                      : "var(--color-naira)",
                transition: "width 0.25s linear",
              }}
            />
          </div>
        </div>
      )}

      {/* 2. My player card */}
      <div
        className="sidebar-player-card"
        style={{
          background: "rgba(0,0,0,0.15)",
          margin: 0,
          borderBottom: "1px solid var(--border-subtle)",
          borderRadius: 0,
        }}
      >
        <div className="sidebar-player-avatar">{me ? tokenEmoji(myToken?.tokenId) : "👤"}</div>
        <div className="sidebar-player-name">{me?.name || "—"}</div>
        <div className="sidebar-player-token-label">
          Token: {me ? tokenName(myToken?.tokenId) : "—"}
        </div>
        <div className="sidebar-player-balance">₦{(me?.cash ?? 0).toLocaleString()}</div>
        <div
          className="sidebar-player-meta"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.5rem",
            width: "100%",
            marginTop: "0.4rem",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
          }}
        >
          <span>
            Net worth{" "}
            <strong style={{ color: "var(--text-secondary)" }}>
              ₦{myNetWorth.toLocaleString()}
            </strong>
          </span>
          <span>
            Round{" "}
            <strong style={{ color: "var(--text-secondary)" }}>
              {engineState.currentTurn ?? 1}
              {engineState.settings?.turnLimit > 0 ? ` / ${engineState.settings.turnLimit}` : ""}
            </strong>
          </span>
        </div>
        {me?.secretObjective && (
          <div
            style={{
              marginTop: "0.75rem",
              width: "100%",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem",
              borderLeft: "2px solid var(--color-gold)",
              fontSize: "0.75rem",
              textAlign: "left",
            }}
          >
            <div
              style={{
                color: "var(--color-gold)",
                fontWeight: 600,
                marginBottom: "0.2rem",
                textTransform: "uppercase",
                fontSize: "0.65rem",
                letterSpacing: "1px",
              }}
            >
              Secret Objective
            </div>
            <div
              style={{
                color: "var(--text-secondary)",
                textDecoration: me.objectiveCompleted ? "line-through" : "none",
                opacity: me.objectiveCompleted ? 0.6 : 1,
              }}
            >
              {me.secretObjective === "own_2_airports" && "Own at least 2 Airports"}
              {me.secretObjective === "complete_color_set" && "Complete any color set"}
              {me.secretObjective === "cash_2m" && "Have ₦2,000,000 in cash"}
              {me.secretObjective === "own_4_properties" && "Own any 4 properties"}
              {me.secretObjective === "first_hotel" && "Build a Hotel"}
            </div>
            {me.objectiveCompleted && (
              <div style={{ color: "var(--color-green)", fontWeight: 600, marginTop: "0.2rem" }}>
                Bonus claimed! ✅
              </div>
            )}
          </div>
        )}
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

      {/* Bankruptcy warning — covers negative cash AND ledger debts (rent owed
          while short on cash), which used to be invisible here. */}
      {me && inDebt && (
        <div
          style={{
            margin: "0.75rem",
            padding: "0.5rem",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "2px",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--color-danger)",
              textAlign: "center",
              fontWeight: "bold",
              marginBottom: "0.3rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <IconWarning size={16} /> DEBT: ₦
            {(Math.max(0, -me.cash) + myLedgerDebt).toLocaleString()}
          </div>
          <button
            className="button-primary"
            style={{
              width: "100%",
              background: "var(--color-gold)",
              color: "#000",
              fontSize: "0.75rem",
              padding: "0.4rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              borderRadius: "2px",
            }}
            onClick={() => setShowDebtRescue(true)}
          >
            Settle Debt <IconBankrupt size={16} />
          </button>
        </div>
      )}

      {/* Trade pending notices */}
      {activeTrade && activeTrade.fromId === mySessionId && (
        <div
          style={{
            margin: "0.75rem",
            padding: "0.4rem",
            fontSize: "0.72rem",
            textAlign: "center",
            color: "var(--text-secondary)",
            border: "1px solid rgba(232,182,74,0.15)",
            borderRadius: "2px",
            background: "rgba(232,182,74,0.03)",
          }}
        >
          <div style={{ marginBottom: "0.35rem" }}>🤝 Waiting for trade response...</div>
          <button
            className="button-primary"
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid rgba(232,182,74,0.35)",
              color: "var(--color-gold)",
              fontSize: "0.68rem",
              padding: "0.25rem",
              borderRadius: "2px",
            }}
            onClick={() => onSendAction({ type: "CANCEL_TRADE" })}
          >
            Withdraw Offer
          </button>
        </div>
      )}
      {activeTrade && activeTrade.fromId !== mySessionId && activeTrade.toId !== mySessionId && (
        <div
          style={{
            margin: "0.75rem",
            padding: "0.4rem",
            fontSize: "0.72rem",
            textAlign: "center",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "2px",
          }}
        >
          🤝 Trade in progress...
        </div>
      )}

      {/* 4. Action buttons */}
      <div
        className="sidebar-actions"
        style={{
          padding: "0.75rem 1rem",
          background: "#1c1835",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
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
            tokenWalking={!!myTokenWalking}
          />
        )}
      </div>

      {/* Auto End Turn toggle */}
      {!isBankrupt && (
        <>
          <div
            style={{
              padding: "0.4rem 1rem",
              borderBottom: "1px solid var(--border-subtle)",
              textAlign: "center",
            }}
          >
            <button
              className="button-primary"
              style={{
                width: "100%",
                background: "transparent",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "var(--color-danger)",
                fontSize: "0.65rem",
                padding: "0.25rem",
                borderRadius: "2px",
              }}
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to go bankrupt and leave the game? This cannot be undone.",
                  )
                )
                  onSendAction({ type: "FORFEIT" });
              }}
            >
              Declare Bankruptcy (Leave Game)
            </button>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.4rem 1rem",
              background: "rgba(0,0,0,0.2)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={!!autoEndTurn}
                onChange={onToggleAutoEndTurn}
                style={{ cursor: "pointer" }}
              />
              Auto End Turn
            </label>
            {autoEndTurn && isMyTurn && phase === "awaiting-end-turn" && (me?.cash ?? 0) >= 0 && (
              <span
                style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontStyle: "italic" }}
              >
                ⏳ auto ~2s
              </span>
            )}
          </div>
        </>
      )}

      {/* 5. My properties — click a holding to open its card (upgrade/sell there) */}
      <PropertyList engineState={engineState} mySessionId={mySessionId} onOpenTile={onOpenTile} />
    </div>
  );
}
