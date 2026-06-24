import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Room } from "colyseus.js";
import { BOARD, PropertyTile, Tile } from "../../data/board";
import { getDevelopmentName } from "../../engine/engine";
import { GameState, Player, Action, TradeOffer, TileState } from "../../engine/types";
import { tokenEmoji } from "../../data/tokens";
import { RoomState } from "../../shared/room";
import { IconRoll, IconBuild, IconSell, IconMortgage, IconUnmortgage, IconTrade, IconAuction, IconTimer, IconBankrupt, IconTrophy, IconWarning } from "./icons";

interface ControlPanelProps {
  room: Room;
  engineState: GameState;
  onSendAction: (action: Action) => void;
  autoEndTurn?: boolean;
  onToggleAutoEndTurn?: () => void;
  turnDeadline?: number;
  turnTimeoutSecs?: number;
}

export default function ControlPanel({ room, engineState, onSendAction, autoEndTurn, onToggleAutoEndTurn, turnDeadline, turnTimeoutSecs }: ControlPanelProps) {
  const [now, setNow] = useState<number>(Date.now());
  const [tradeTargetId, setTradeTargetId] = useState<string>("");
  const [tradeGiveCash, setTradeGiveCash] = useState<number>(0);
  const [tradeGetCash, setTradeGetCash] = useState<number>(0);
  const [tradeGiveTiles, setTradeGiveTiles] = useState<number[]>([]);
  const [tradeGetTiles, setTradeGetTiles] = useState<number[]>([]);
  const [showTradeBuilder, setShowTradeBuilder] = useState<boolean>(false);

  // Parse game state properties
  const mySessionId = room.sessionId;
  const players = engineState?.players || [];
  const tilesState = engineState?.tiles || {};
  const me = players.find((p: Player) => p.id === mySessionId);
  const currentPlayer = players[engineState?.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === mySessionId;
  const isBankrupt = me?.bankrupt;
  // Property management (build/sell/mortgage/trade) is only legal on your own
  // turn while rolling or wrapping up — the engine rejects it otherwise. The
  // holdings list itself stays visible regardless of whose turn it is.
  const canManage =
    isMyTurn &&
    (engineState?.phase === "awaiting-roll" || engineState?.phase === "awaiting-end-turn");

  // Open-outcry auction: any participant who has not folded (and is not already
  // the top bidder) may raise at any time, until the countdown expires.
  const auction = engineState?.auctionState;
  const isAuctionActive = engineState?.phase === "auction" && auction;
  const iAmParticipant = isAuctionActive && auction.participantIds?.includes(mySessionId);
  const iPassed = isAuctionActive && auction.passedIds?.includes(mySessionId);
  const iAmHighest = isAuctionActive && auction.highestBidderId === mySessionId;
  const canBid = iAmParticipant && !iPassed && !iAmHighest;

  // Tick a local clock (~10x/sec) while an auction is live so the countdown bar
  // animates smoothly. The deadline itself is server-authoritative.
  useEffect(() => {
    if (!isAuctionActive || !auction?.deadline) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [isAuctionActive, auction?.deadline]);

  const msLeft = isAuctionActive && auction?.deadline ? Math.max(0, auction.deadline - now) : 0;
  const secsLeft = Math.ceil(msLeft / 1000);
  const timerPct = isAuctionActive && auction?.deadline
    ? Math.max(0, Math.min(100, (msLeft / (auction.bidDurationMs || 12000)) * 100))
    : 0;

  // Per-turn AFK timer (server-driven). Ticks independently of the auction clock.
  useEffect(() => {
    if (!turnDeadline || turnDeadline <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [turnDeadline]);
  const turnMsLeft = turnDeadline && turnDeadline > 0 ? Math.max(0, turnDeadline - now) : 0;
  const turnSecsLeft = Math.ceil(turnMsLeft / 1000);
  const turnPct = turnDeadline && turnDeadline > 0 && turnTimeoutSecs
    ? Math.max(0, Math.min(100, (turnMsLeft / (turnTimeoutSecs * 1000)) * 100))
    : 0;

  // Reset trade builder when turn or phase changes
  useEffect(() => {
    setShowTradeBuilder(false);
    setTradeTargetId("");
    setTradeGiveCash(0);
    setTradeGetCash(0);
    setTradeGiveTiles([]);
    setTradeGetTiles([]);
  }, [engineState?.currentPlayerIndex, engineState?.phase]);

  if (!engineState) return null;

  // Get recipient player object if trading is in progress
  const activeTrade = engineState.activeTrade;

  // Find recipient/proposer names for active trade
  const tradeProposer = activeTrade ? players.find((p: Player) => p.id === activeTrade.fromId) : null;

  // Retrieve tile names for trade listings
  const getTileNamesStr = (posArray: number[]) => {
    if (posArray.length === 0) return "None";
    return posArray.map((pos) => BOARD[pos].name).join(", ");
  };

  // Build / mortgage details helpers
  const myProperties = BOARD.filter((tile: Tile) => {
    const ts = tilesState[tile.pos];
    return ts && ts.ownerId === mySessionId;
  });

  const targetProperties = tradeTargetId
    ? BOARD.filter((tile: Tile) => {
        const ts = tilesState[tile.pos];
        return ts && ts.ownerId === tradeTargetId;
      })
    : [];

  const handleProposeTrade = () => {
    if (!tradeTargetId) return;
    const tradeOffer: TradeOffer = {
      fromId: mySessionId,
      toId: tradeTargetId,
      giveCash: Number(tradeGiveCash) || 0,
      getCash: Number(tradeGetCash) || 0,
      giveTiles: tradeGiveTiles,
      getTiles: tradeGetTiles,
    };
    onSendAction({ type: "PROPOSE_TRADE", trade: tradeOffer });
    setShowTradeBuilder(false);
  };

  const toggleGiveTile = (pos: number) => {
    setTradeGiveTiles((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const toggleGetTile = (pos: number) => {
    setTradeGetTiles((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  // Administration validation helpers
  const canBuild = (pos: number) => {
    const tile = BOARD[pos];
    if (tile.type !== "property") return false;
    const ts = tilesState[pos];
    if (!ts || ts.ownerId !== mySessionId || ts.mortgaged || ts.houses >= 5) return false;

    // Must own full color group
    const groupTiles = BOARD.filter((t: Tile): t is PropertyTile => t.type === "property" && t.group === tile.group);
    const ownsAll = groupTiles.every((t: PropertyTile) => tilesState[t.pos]?.ownerId === mySessionId);
    
    // Condition 1: Must own all in group
    if (!ownsAll) return false;

    // Condition 2: No property in group can be mortgaged
    const anyMortgaged = groupTiles.some((t: PropertyTile) => tilesState[t.pos]?.mortgaged);
    if (anyMortgaged) return false;

    // Condition 3: "Even building" rule — you can't have a 2nd house until everywhere else has a 1st
    const targetHouses = Math.min((tilesState[tile.pos]?.houses ?? 0) + 1, 5);
    const violatesEven = groupTiles.some((t: PropertyTile) => (tilesState[t.pos]?.houses ?? 0) < targetHouses - 1);
    if (violatesEven) return false;

    // Cash check
    if ((me?.cash || 0) < tile.houseCost) return false;

    return true;
  };

  const canSellHouse = (pos: number) => {
    const tile = BOARD[pos];
    if (tile.type !== "property") return false;
    const ts = tilesState[pos];
    if (!ts || ts.ownerId !== mySessionId || ts.houses === 0) return false;

    // Even sell constraint
    const groupTiles = BOARD.filter((t: Tile): t is PropertyTile => t.type === "property" && t.group === tile.group);
    const targetHouses = Math.max((tilesState[tile.pos]?.houses ?? 0) - 1, 0);
    const violatesEven = groupTiles.some((t: PropertyTile) => (tilesState[t.pos]?.houses ?? 0) > targetHouses + 1);
    if (violatesEven) return false;

    return true;
  };

  const canMortgage = (pos: number) => {
    const ts = tilesState[pos];
    if (!ts || ts.ownerId !== mySessionId || ts.mortgaged) return false;

    // If property, must have no houses on any property in color group
    const tile = BOARD[pos];
    if (tile.type === "property") {
      const groupTiles = BOARD.filter((t: Tile): t is PropertyTile => t.type === "property" && t.group === tile.group);
      const hasBuildings = groupTiles.some((t: PropertyTile) => (tilesState[t.pos]?.houses ?? 0) > 0);
      if (hasBuildings) return false;
    }
    return true;
  };

  const canUnmortgage = (pos: number) => {
    const ts = tilesState[pos];
    if (!ts || ts.ownerId !== mySessionId || !ts.mortgaged) return false;
    const tile = BOARD[pos];
    if (!("mortgage" in tile)) return false;
    const cost = Math.round(tile.mortgage * 1.1);
    return (me?.cash || 0) >= cost;
  };

  // The live synced room state (lobbyPlayers is a MapSchema at runtime, but
  // exposes the same .get the RoomState view type declares).
  const liveState = room.state as RoomState | undefined;

  // Get token emoji for a player via roomState lobbyPlayers
  const getTokenEmoji = (playerId: string) => {
    const lp = liveState?.lobbyPlayers?.get(playerId);
    if (lp?.tokenId) return tokenEmoji(lp.tokenId);
    return tokenEmoji(undefined);
  };

  // Get the token name for a player
  const getTokenName = (playerId: string) => {
    const lp = liveState?.lobbyPlayers?.get(playerId);
    if (lp?.tokenId) {
      const names: Record<string, string> = { okada: "Okada", danfo_bus: "Danfo", agbada: "Agbada", eagle: "Eagle", keke: "Keke", fila: "Fila" };
      return names[lp.tokenId] || lp.tokenId;
    }
    return "—";
  };

  // Property status label
  const getPropStatus = (ts: TileState | undefined) => {
    if (!ts) return "";
    if (ts.mortgaged) return "Mortgaged";
    if (ts.houses > 0) return getDevelopmentName(ts.houses);
    return "";
  };

  const getPropStatusClass = (ts: TileState | undefined) => {
    if (!ts) return "";
    if (ts.mortgaged) return "status-mortgaged";
    if (ts.houses > 0) return "status-house";
    return "";
  };

  return (
    <div className="console-panel glass-panel" style={{ padding: 0, overflow: "hidden" }}>
      {/* Trade response overlay (modal style) */}
      <AnimatePresence>
      {activeTrade && activeTrade.toId === mySessionId && (
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
              <strong>{tradeProposer?.name}</strong> proposed a trade deal to you!
            </p>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", background: "rgba(0,0,0,0.3)", padding: "1rem", borderRadius: "8px" }}>
              <div>
                <strong style={{ color: "var(--color-naira)" }}>You will receive:</strong>
                <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  <div>Cash: ₦{activeTrade.giveCash.toLocaleString()}</div>
                  <div style={{ color: "var(--text-secondary)" }}>Properties: {getTileNamesStr(activeTrade.giveTiles)}</div>
                </div>
              </div>
              <div>
                <strong style={{ color: "var(--color-danger)" }}>You will give:</strong>
                <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  <div>Cash: ₦{activeTrade.getCash.toLocaleString()}</div>
                  <div style={{ color: "var(--text-secondary)" }}>Properties: {getTileNamesStr(activeTrade.getTiles)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button
                className="button-primary"
                style={{ flex: 1, background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                onClick={() => {
                  const summary = `You RECEIVE: ₦${activeTrade.giveCash.toLocaleString()} + ${getTileNamesStr(activeTrade.giveTiles)}\nYou GIVE: ₦${activeTrade.getCash.toLocaleString()} + ${getTileNamesStr(activeTrade.getTiles)}`;
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
      )}
      </AnimatePresence>

      {/* Trade proposal building interface */}
      <AnimatePresence>
      {showTradeBuilder && (
        <motion.div
          className="trade-overlay"
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
        >
          <div className="trade-card glass-panel" style={{ background: "#0e1525", maxWidth: "550px", overflowY: "auto", maxHeight: "90vh" }}>
            <h3 className="auction-title" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><IconTrade size={22} /> Propose Trade Deal</h3>
            
            {/* Recipient selection */}
            <div className="form-group">
              <label>Select Player to Trade With:</label>
              <select
                className="input-field"
                value={tradeTargetId}
                onChange={(e) => {
                  setTradeTargetId(e.target.value);
                  setTradeGetTiles([]);
                }}
              >
                <option value="">-- Choose Player --</option>
                {players
                  .filter((p: Player) => p.id !== mySessionId && !p.bankrupt)
                  .map((p: Player) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>

            {tradeTargetId && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                  {/* Proposer Offers */}
                  <div className="form-group">
                    <label>You Offer Cash (₦):</label>
                    <input
                      type="number"
                      className="input-field"
                      min={0}
                      max={me?.cash || 0}
                      step={10000}
                      value={tradeGiveCash}
                      onChange={(e) => setTradeGiveCash(Math.max(0, Number(e.target.value)))}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Max: ₦{me?.cash.toLocaleString()}</span>
                  </div>

                  {/* Recipient Offers */}
                  <div className="form-group">
                    <label>You Ask Cash (₦):</label>
                    <input
                      type="number"
                      className="input-field"
                      min={0}
                      max={players.find((p: Player) => p.id === tradeTargetId)?.cash || 0}
                      step={10000}
                      value={tradeGetCash}
                      onChange={(e) => setTradeGetCash(Math.max(0, Number(e.target.value)))}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Max: ₦{players.find((p: Player) => p.id === tradeTargetId)?.cash.toLocaleString()}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                  {/* Select tiles to give */}
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-secondary)" }}>Give Properties:</label>
                    <div style={{ maxHeight: "120px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "6px", marginTop: "0.25rem" }}>
                      {myProperties.filter((t: Tile) => (tilesState[t.pos]?.houses ?? 0) === 0).map((t: Tile) => (
                        <label key={t.pos} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", margin: "4px 0", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={tradeGiveTiles.includes(t.pos)}
                            onChange={() => toggleGiveTile(t.pos)}
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                      {myProperties.filter((t: Tile) => (tilesState[t.pos]?.houses ?? 0) === 0).length === 0 && (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" }}>No unimproved properties</div>
                      )}
                    </div>
                  </div>

                  {/* Select tiles to get */}
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-secondary)" }}>Request Properties:</label>
                    <div style={{ maxHeight: "120px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "6px", marginTop: "0.25rem" }}>
                      {targetProperties.filter((t: Tile) => (tilesState[t.pos]?.houses ?? 0) === 0).map((t: Tile) => (
                        <label key={t.pos} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", margin: "4px 0", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={tradeGetTiles.includes(t.pos)}
                            onChange={() => toggleGetTile(t.pos)}
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                      {targetProperties.filter((t: Tile) => (tilesState[t.pos]?.houses ?? 0) === 0).length === 0 && (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" }}>No unimproved properties</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
              <button
                className="button-primary"
                disabled={!tradeTargetId || (tradeGiveTiles.length === 0 && tradeGetTiles.length === 0 && tradeGiveCash === 0 && tradeGetCash === 0)}
                onClick={handleProposeTrade}
                style={{ flex: 1 }}
              >
                Propose Deal
              </button>
              <button
                className="button-secondary"
                onClick={() => setShowTradeBuilder(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ─── SIDEBAR LAYOUT ─── */}

      {/* 1. Turn / Round Indicator */}
      <div className="sidebar-turn-indicator">
        <div>
          <div className="sidebar-turn-label">Turn</div>
          <div style={{ fontSize: "0.8rem", color: isMyTurn ? "var(--color-naira)" : "var(--text-secondary)", fontWeight: 600 }}>
            {isMyTurn ? "Your Turn" : (currentPlayer?.name || "—")}
          </div>
        </div>
        <div className="sidebar-round-badge">
          <span className="round-label">Round</span>
          <span className="round-number">{engineState.currentTurn ?? 1}</span>
          {engineState.settings?.turnLimit > 0 && (
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>/ {engineState.settings.turnLimit}</span>
          )}
        </div>
      </div>

      {/* Turn timer countdown */}
      {isMyTurn && !isBankrupt && !isAuctionActive && turnDeadline && turnDeadline > 0 && (
        <div style={{ padding: "0.3rem 0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}><IconTimer size={14} /> Turn timer</span>
            <span style={{ fontWeight: "bold", color: turnPct < 20 ? "var(--color-danger)" : turnPct < 50 ? "var(--color-gold)" : "var(--color-naira)" }}>{turnSecsLeft}s</span>
          </div>
          <div style={{ height: "4px", background: "rgba(0,0,0,0.4)", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{ width: `${turnPct}%`, height: "100%", background: turnPct < 20 ? "var(--color-danger)" : turnPct < 50 ? "var(--color-gold)" : "var(--color-naira)", transition: "width 0.25s linear" }} />
          </div>
        </div>
      )}

      {/* 2. Active Player Card */}
      <div className="sidebar-player-card">
        <div className="sidebar-player-avatar">
          {me ? getTokenEmoji(me.id) : "👤"}
        </div>
        <div className="sidebar-player-name">{me?.name || "—"}</div>
        <div className="sidebar-player-token-label">Token: {me ? getTokenName(me.id) : "—"}</div>
        <div className="sidebar-player-balance">₦{(me?.cash ?? 0).toLocaleString()}</div>
      </div>

      {/* Auction Panel — appears when auction is active */}
      <AnimatePresence>
      {isAuctionActive && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          style={{ overflow: "hidden" }}
        >
          <div className={`auction-panel ${secsLeft <= 3 && auction.deadline ? "auction-urgent" : ""}`} style={{ margin: "0 0.75rem", borderRadius: "var(--radius-md)" }}>
            <div className="auction-title" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}><IconAuction size={20} /> LIVE AUCTION</div>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              <strong>{BOARD[auction.tilePos].name}</strong>
            </div>

            {/* Countdown timer */}
            {auction.deadline && (
              <div className="auction-timer">
                <div className="auction-timer-bar">
                  <div
                    className={`auction-timer-fill ${secsLeft <= 3 ? "urgent" : ""}`}
                    style={{ width: `${timerPct}%` }}
                  />
                </div>
                <div className={`auction-timer-secs ${secsLeft <= 3 ? "urgent" : ""}`}>
                  {secsLeft > 0 ? `${secsLeft}s` : "GONE!"}
                </div>
              </div>
            )}

            <div className="auction-bid-hud">
              <span>Top: <strong style={{ color: "var(--color-naira)" }}>₦{auction.highestBid.toLocaleString()}</strong></span>
              <span>{auction.highestBidderId ? players.find((p: Player) => p.id === auction.highestBidderId)?.name : "No bids"}</span>
            </div>

            {canBid ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div className="auction-increment-buttons">
                  {auction.bidIncrements.map((inc: number) => {
                    const total = auction.highestBid + inc;
                    const tooRich = (me?.cash || 0) < total;
                    return (
                      <button
                        key={inc}
                        className="button-primary bid-increment-btn"
                        disabled={tooRich}
                        title={tooRich ? "Not enough cash" : `Bid ₦${total.toLocaleString()}`}
                        onClick={() => onSendAction({ type: "BID", amount: total })}
                        style={{ fontSize: "0.7rem", padding: "0.4rem 0.2rem" }}
                      >
                        ▲ ₦{inc.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="button-secondary"
                  onClick={() => onSendAction({ type: "PASS_BID" })}
                  style={{ fontSize: "0.75rem", padding: "0.35rem" }}
                >
                  Pass
                </button>
              </div>
            ) : iAmHighest ? (
              <div className="action-status-indicator" style={{ color: "var(--color-naira)", fontWeight: "bold", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                <IconTrophy size={16} /> You hold the top bid!
              </div>
            ) : iPassed ? (
              <div className="action-status-indicator" style={{ fontSize: "0.75rem" }}>
                You folded.
              </div>
            ) : (
              <div className="action-status-indicator" style={{ fontSize: "0.75rem" }}>
                Spectating…
              </div>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Bankruptcy warning */}
      {me && me.cash < 0 && !isBankrupt && (
        <div style={{ margin: "0 0.75rem", padding: "0.5rem", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-danger)", textAlign: "center", fontWeight: "bold", marginBottom: "0.3rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
            <IconWarning size={16} /> DEBT: ₦{me.cash.toLocaleString()}
          </div>
          <button
            className="button-primary"
            style={{ width: "100%", background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", fontSize: "0.75rem", padding: "0.4rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
            onClick={() => {
              if (window.confirm("Declare bankruptcy? You will lose everything.")) {
                onSendAction({ type: "DECLARE_BANKRUPT" });
              }
            }}
          >
            Declare Bankruptcy <IconBankrupt size={16} />
          </button>
        </div>
      )}

      {/* Trade pending / passive statuses */}
      {activeTrade && activeTrade.fromId === mySessionId && (
        <div style={{ margin: "0 0.75rem", padding: "0.4rem", fontSize: "0.72rem", textAlign: "center", color: "var(--text-secondary)", border: "1px solid rgba(245, 158, 11, 0.15)", borderRadius: "var(--radius-sm)", background: "rgba(245, 158, 11, 0.03)" }}>
          🤝 Waiting for trade response...
        </div>
      )}
      {activeTrade && activeTrade.fromId !== mySessionId && activeTrade.toId !== mySessionId && (
        <div style={{ margin: "0 0.75rem", padding: "0.4rem", fontSize: "0.72rem", textAlign: "center", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
          🤝 Trade in progress...
        </div>
      )}

      {/* 3. My Properties — compact list with inline action buttons */}
      <div className="sidebar-properties">
        <div className="sidebar-properties-list">
          {myProperties.length === 0 ? (
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "0.5rem" }}>
              No properties yet
            </div>
          ) : (
            myProperties.map((tile: Tile) => {
              const ts = tilesState[tile.pos];
              const isProp = tile.type === "property";
              const status = getPropStatus(ts);
              const statusClass = getPropStatusClass(ts);
              return (
                <div key={tile.pos} className="sidebar-prop-row" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "0.3rem", padding: "0.4rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div className="sidebar-prop-left">
                      {isProp && (
                        <span
                          className="sidebar-prop-dot"
                          style={{ background: `var(--color-${(tile as PropertyTile).group})` }}
                        />
                      )}
                      {!isProp && (
                        <span className="sidebar-prop-dot" style={{ background: "var(--text-muted)" }} />
                      )}
                      <span className="sidebar-prop-name" style={{ maxWidth: "150px" }}>{tile.name}</span>
                    </div>
                    <span className={`sidebar-prop-status ${statusClass}`}>
                      {status}
                    </span>
                  </div>

                  {canManage && (canBuild(tile.pos) || canSellHouse(tile.pos) || canMortgage(tile.pos) || canUnmortgage(tile.pos)) && (
                    <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end", marginTop: "0.1rem" }}>
                      {canBuild(tile.pos) && (
                        <button
                          style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-naira)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.2rem" }}
                          onClick={() => onSendAction({ type: "BUILD", pos: tile.pos })}
                          title={`Build ₦${((tile as PropertyTile).houseCost || 0).toLocaleString()}`}
                        >
                          <IconBuild size={13} /> Build ₦{((tile as PropertyTile).houseCost || 0) / 1000}k
                        </button>
                      )}
                      {canSellHouse(tile.pos) && (
                        <button
                          style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", background: "rgba(239, 68, 68, 0.15)", color: "var(--color-danger)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.2rem" }}
                          onClick={() => onSendAction({ type: "SELL_HOUSE", pos: tile.pos })}
                          title={`Sell house (receive ₦${((tile as PropertyTile).houseCost || 0) / 2})`}
                        >
                          <IconSell size={13} /> Sell
                        </button>
                      )}
                      {canMortgage(tile.pos) && (
                        <button
                          style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", background: "rgba(245, 158, 11, 0.15)", color: "var(--color-gold)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.2rem" }}
                          onClick={() => onSendAction({ type: "MORTGAGE", pos: tile.pos })}
                          title={`Mortgage (receive ₦${("mortgage" in tile ? tile.mortgage : 0).toLocaleString()})`}
                        >
                          <IconMortgage size={13} /> Mortgage
                        </button>
                      )}
                      {canUnmortgage(tile.pos) && (
                        <button
                          style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-naira)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.2rem" }}
                          onClick={() => onSendAction({ type: "UNMORTGAGE", pos: tile.pos })}
                          title={`Unmortgage (pay ₦${Math.round(("mortgage" in tile ? tile.mortgage : 0) * 1.1).toLocaleString()})`}
                        >
                          <IconUnmortgage size={13} /> Unmortgage
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. Action Buttons — horizontal row */}
      <div className="sidebar-actions">
        {isBankrupt ? (
          <div style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.25rem" }}>
            💀 Spectating
          </div>
        ) : isAuctionActive ? null : (
          <>
            {/* Roll Dice / Jail actions */}
            {engineState.phase === "awaiting-roll" && isMyTurn && (
              me?.inJail ? (
                <>
                  <button
                    className="sidebar-action-btn sidebar-action-btn-primary"
                    onClick={() => onSendAction({ type: "ROLL" })}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
                  >
                    <IconRoll size={18} /> Roll
                  </button>
                  <button
                    className="sidebar-action-btn sidebar-action-btn-outline"
                    onClick={() => onSendAction({ type: "PAY_JAIL_FINE" })}
                    disabled={(me?.cash || 0) < 50000}
                    title="Pay ₦50,000"
                  >
                    Pay Fine
                  </button>
                  <button
                    className="sidebar-action-btn sidebar-action-btn-outline"
                    onClick={() => onSendAction({ type: "USE_JAIL_CARD" })}
                    disabled={(me?.getOutOfJailCards || 0) === 0}
                    title={`Jail cards: ${me?.getOutOfJailCards || 0}`}
                  >
                    Jail Card
                  </button>
                </>
              ) : (
                <>
                  <motion.button
                    className="sidebar-action-btn sidebar-action-btn-primary"
                    onClick={() => onSendAction({ type: "ROLL" })}
                    whileTap={{ scale: 0.94 }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
                  >
                    <IconRoll size={18} /> Roll Dice
                  </motion.button>
                  <button
                    className="sidebar-action-btn sidebar-action-btn-outline"
                    onClick={() => setShowTradeBuilder(true)}
                    disabled={!canManage || players.length < 2 || activeTrade !== null}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                  >
                    <IconTrade size={16} /> Trade
                  </button>
                </>
              )
            )}

            {/* Buy / Decline */}
            {engineState.phase === "awaiting-buy-decision" && isMyTurn && (
              <>
                {(() => {
                  const tile = me ? BOARD[me.position] : undefined;
                  const price = tile && "price" in tile ? tile.price : 0;
                  return (
                    <>
                      <button
                        className="sidebar-action-btn sidebar-action-btn-primary"
                        disabled={(me?.cash || 0) < price}
                        onClick={() => onSendAction({ type: "BUY" })}
                      >
                        Buy ₦{(price / 1000).toFixed(0)}k
                      </button>
                      <button
                        className="sidebar-action-btn sidebar-action-btn-outline"
                        onClick={() => onSendAction({ type: "DECLINE_BUY" })}
                      >
                        Auction
                      </button>
                    </>
                  );
                })()}
              </>
            )}

            {/* Awaiting end turn — actions */}
            {engineState.phase === "awaiting-end-turn" && isMyTurn && (
              <>
                <button
                  className="sidebar-action-btn sidebar-action-btn-outline"
                  onClick={() => setShowTradeBuilder(true)}
                  disabled={!canManage || players.length < 2 || activeTrade !== null}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                >
                  <IconTrade size={16} /> Trade
                </button>
              </>
            )}

            {/* Not my turn — show waiting */}
            {!isMyTurn && !isAuctionActive && (
              <div style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.25rem" }}>
                ⏳ Waiting for {currentPlayer?.name || "—"}
              </div>
            )}
          </>
        )}
      </div>

      {/* Auto End Turn toggle (compact) */}
      {!isBankrupt && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.3rem 0.75rem", borderBottom: "1px solid var(--border-subtle)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.68rem", color: "var(--text-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!autoEndTurn}
              onChange={onToggleAutoEndTurn}
              style={{ cursor: "pointer" }}
            />
            Auto End Turn
          </label>
          {autoEndTurn && isMyTurn && engineState.phase === "awaiting-end-turn" && (me?.cash ?? 0) >= 0 && (
            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontStyle: "italic" }}>⏳ auto ~2s</span>
          )}
        </div>
      )}

      {/* 5. Players List */}
      <div className="sidebar-players">
        <div className="sidebar-players-title">Players</div>
        <div className="sidebar-players-list">
          {players.map((p: Player) => {
            const isActive = p.id === currentPlayer?.id;
            return (
              <div
                key={p.id}
                className={`sidebar-player-row ${p.bankrupt ? "bankrupt" : ""}`}
              >
                <div className="sidebar-player-row-left">
                  <div className={`sidebar-player-row-avatar ${isActive ? "active-turn" : ""}`}>
                    {getTokenEmoji(p.id)}
                  </div>
                  <div>
                    <div className="sidebar-player-row-name">
                      {p.name} {p.id === mySessionId && "(You)"}
                    </div>
                    {p.bankrupt ? (
                      <div className="sidebar-player-row-status" style={{ color: "var(--color-danger)" }}>Bankrupt</div>
                    ) : !isActive ? (
                      <div className="sidebar-player-row-status is-waiting">Waiting</div>
                    ) : (
                      <div className="sidebar-player-row-status" style={{ color: "var(--color-gold)" }}>Playing</div>
                    )}
                  </div>
                </div>
                <div className="sidebar-player-row-cash">
                  ₦{p.cash.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
