import { useState, useEffect } from "react";
import { Room } from "colyseus.js";
import { GameState, Action } from "../../engine/types";
import { tokenEmoji } from "../../data/tokens";
import { tokenName } from "../../data/tokens";
import { RoomState } from "../../shared/room";
import { netWorth } from "../lib/holdings";
import { IconTimer, IconBankrupt, IconWarning } from "./icons";
import PlayerList from "./PlayerList";
import ChaosStandingPanel from "./ChaosStandingPanel";
import ActionButtons from "./ActionButtons";
import PropertyList from "./PropertyList";

interface ControlPanelProps {
  room: Room;
  engineState: GameState;
  onSendAction: (action: Action) => void;
  autoEndTurn?: boolean;
  onToggleAutoEndTurn?: () => void;
  turnDeadline?: number;
  turnTimeoutSecs?: number;
  onOpenTile?: (pos: number) => void;
  onOpenTrade: () => void;
  onOpenDebtRescue: () => void;
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
  onOpenTrade,
  onOpenDebtRescue,
  myTokenWalking,
}: ControlPanelProps) {
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
      {/* 1. Player roster */}
      <PlayerList
        engineState={engineState}
        mySessionId={mySessionId}
        liveState={liveState}
        onSendAction={onSendAction}
      />

      <section className="v2-game-info-card" aria-label="Game info">
        <h2>Game Info</h2>
        <div className="v2-game-info-row">
          <span>🏦 Bank</span>
          <strong>₦{Math.abs(engineState.bank ?? 0).toLocaleString()}</strong>
        </div>
        <div className="v2-game-info-row">
          <span>🕘 Turn</span>
          <strong>
            {engineState.currentTurn ?? 1}
            {engineState.settings?.turnLimit > 0 ? ` / ${engineState.settings.turnLimit}` : " / ∞"}
          </strong>
        </div>
        <div className="v2-game-info-row">
          <span>⏳ Time Left</span>
          <strong>{turnDeadline && turnDeadline > 0 ? `${turnSecsLeft}s` : "No timer"}</strong>
        </div>
      </section>

      {/* Per-turn AFK countdown */}
      {isMyTurn && !isBankrupt && !isAuctionActive && turnDeadline && turnDeadline > 0 && (
        <div
          className="sidebar-turn-timer"
          style={{
            padding: "0.5rem 1rem",
            background: "var(--pri-50)",
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
              background: "var(--sunken)",
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
          background: "var(--sunken)",
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
              background: "var(--sunken)",
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
              <div style={{ color: "var(--pri)", fontWeight: 600, marginTop: "0.2rem" }}>
                Bonus claimed! ✅
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. The live auction and the timed chaos decisions used to render HERE,
          inline. Under 980px this sidebar is grid row 2 — below the board — so
          both scrolled off-screen exactly when a server clock was running.
          Step B4a promoted them to decision sheets at the App level.

          What stays inline is what is NOT a forced choice: the standing
          generator offer (no deadline, can last rounds) and the "someone else
          is deciding" notice. */}
      <ChaosStandingPanel
        engineState={engineState}
        mySessionId={mySessionId}
        onSendAction={onSendAction}
      />

      {/* Bankruptcy warning — covers negative cash AND ledger debts (rent owed
          while short on cash), which used to be invisible here. */}
      {me && inDebt && (
        <div
          className="sidebar-debt-warning"
          style={{
            margin: "0.75rem",
            padding: "0.5rem",
            background: "var(--bad-bg)",
            border: "1px solid var(--bad)",
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
              color: "var(--ink)",
              fontSize: "0.75rem",
              padding: "0.4rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              borderRadius: "2px",
            }}
            onClick={onOpenDebtRescue}
          >
            Settle Debt <IconBankrupt size={16} />
          </button>
        </div>
      )}

      {/* Trade pending notices */}
      {activeTrade && activeTrade.fromId === mySessionId && (
        <div
          className="sidebar-trade-notice"
          style={{
            margin: "0.75rem",
            padding: "0.4rem",
            fontSize: "0.72rem",
            textAlign: "center",
            color: "var(--text-secondary)",
            border: "1px solid var(--gold-v2)",
            borderRadius: "2px",
            background: "var(--gold-50)",
          }}
        >
          <div style={{ marginBottom: "0.35rem" }}>🤝 Waiting for trade response...</div>
          <button
            className="button-primary"
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid var(--gold-v2)",
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
          className="sidebar-trade-notice"
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
          background: "var(--sf)",
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
            onShowTradeBuilder={onOpenTrade}
            tokenWalking={!!myTokenWalking}
          />
        )}
      </div>

      {/* Auto End Turn toggle */}
      {!isBankrupt && (
        <>
          <div
            className="sidebar-bankruptcy-action"
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
                border: "1px solid var(--bad)",
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
            className="sidebar-auto-end"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.4rem 1rem",
              background: "var(--sunken)",
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
