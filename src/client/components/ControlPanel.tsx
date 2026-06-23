import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BOARD, PropertyTile } from "../../data/board";
import { tokenEmoji } from "../../data/tokens";
import { TradeOffer } from "../../engine/types";

interface ControlPanelProps {
  room: any;
  engineState: any;
  onSendAction: (action: any) => void;
  chatMessages: any[];
  onSendChatMessage: (text: string, toId?: string) => void;
}

export default function ControlPanel({ room, engineState, onSendAction, chatMessages, onSendChatMessage }: ControlPanelProps) {
  const [now, setNow] = useState<number>(Date.now());
  // Chat channels: "general" (everyone) or a specific playerId (private/direct).
  const [chatChannel, setChatChannel] = useState<string>("general");
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({});
  const [lastMessageCount, setLastMessageCount] = useState(0);

  // Keep the chat scrolled to the newest message in the active channel.
  useEffect(() => {
    const chatElement = document.getElementById("game-chat-box");
    if (chatElement) {
      chatElement.scrollTop = chatElement.scrollHeight;
    }
  }, [chatMessages, chatChannel]);
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
  const me = players.find((p: any) => p.id === mySessionId);
  const isMyTurn = players[engineState?.currentPlayerIndex]?.id === mySessionId;
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

  // Which channel a message belongs to from MY perspective: "general" for
  // broadcasts, otherwise the other party's id for private/direct messages.
  const channelOf = (msg: any) => {
    if (!msg?.toId) return "general";
    return msg.senderId === mySessionId ? msg.toId : msg.senderId;
  };

  // Track unread counts per channel for messages that arrive while I'm not
  // looking at that channel (and that I didn't send myself).
  useEffect(() => {
    if (chatMessages.length > lastMessageCount) {
      const fresh = chatMessages.slice(lastMessageCount);
      setChannelUnread((prev) => {
        const next = { ...prev };
        fresh.forEach((m: any) => {
          if (m.senderId === mySessionId) return;
          const ch = channelOf(m);
          const viewing = chatChannel === ch;
          if (!viewing) next[ch] = (next[ch] || 0) + 1;
        });
        return next;
      });
      setLastMessageCount(chatMessages.length);
    } else if (chatMessages.length === 0) {
      setChannelUnread({});
      setLastMessageCount(0);
    }
  }, [chatMessages.length, chatChannel, lastMessageCount, mySessionId]);

  // Clear the badge for whichever channel I'm currently viewing.
  useEffect(() => {
    setChannelUnread((prev) => (prev[chatChannel] ? { ...prev, [chatChannel]: 0 } : prev));
  }, [chatChannel, chatMessages.length]);

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

  // Chat: everyone except me gets a private channel; messages filtered to the
  // active channel; tab badge sums unread across all channels.
  const otherPlayers = players.filter((p: any) => p.id !== mySessionId);
  const visibleMessages = chatMessages.filter((m: any) => channelOf(m) === chatChannel);
  const activeChannelName =
    chatChannel === "general"
      ? "Everyone"
      : players.find((p: any) => p.id === chatChannel)?.name || "Player";

  const getDevelopmentText = (houses: number) => {
    switch (houses) {
      case 5: return "🏨 Hotel";
      case 4: return "🏘️ Mini-Estate";
      case 3: return "🏰 Mansion";
      case 2: return "🏠 Duplex";
      case 1: return "🏡 Bungalow";
      default: return "";
    }
  };

  // Get recipient player object if trading is in progress
  const activeTrade = engineState.activeTrade;

  // Find recipient/proposer names for active trade
  const tradeProposer = activeTrade ? players.find((p: any) => p.id === activeTrade.fromId) : null;

  // Retrieve tile names for trade listings
  const getTileNamesStr = (posArray: number[]) => {
    if (posArray.length === 0) return "None";
    return posArray.map((pos) => BOARD[pos].name).join(", ");
  };



  // Build / mortgage details helpers
  const myProperties = BOARD.filter((tile: any) => {
    const ts = tilesState[tile.pos];
    return ts && ts.ownerId === mySessionId;
  });

  const targetProperties = tradeTargetId
    ? BOARD.filter((tile: any) => {
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
    const groupTiles = BOARD.filter((t: any): t is PropertyTile => t.type === "property" && t.group === tile.group);
    const ownsAll = groupTiles.every((t: any) => tilesState[t.pos]?.ownerId === mySessionId);
    if (!ownsAll) return false;

    // None in group can be mortgaged
    const anyMortgaged = groupTiles.some((t: any) => tilesState[t.pos]?.mortgaged);
    if (anyMortgaged) return false;

    // Even build constraint
    const targetHouses = ts.houses;
    const violatesEven = groupTiles.some((t: any) => (tilesState[t.pos]?.houses ?? 0) < targetHouses);
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
    const groupTiles = BOARD.filter((t: any): t is PropertyTile => t.type === "property" && t.group === tile.group);
    const targetHouses = ts.houses;
    const violatesEven = groupTiles.some((t: any) => (tilesState[t.pos]?.houses ?? 0) > targetHouses);
    if (violatesEven) return false;

    return true;
  };

  const canMortgage = (pos: number) => {
    const ts = tilesState[pos];
    if (!ts || ts.ownerId !== mySessionId || ts.mortgaged) return false;

    // If property, must have no houses on any property in color group
    const tile = BOARD[pos];
    if (tile.type === "property") {
      const groupTiles = BOARD.filter((t: any): t is PropertyTile => t.type === "property" && t.group === tile.group);
      const hasBuildings = groupTiles.some((t: any) => (tilesState[t.pos]?.houses ?? 0) > 0);
      if (hasBuildings) return false;
    }
    return true;
  };

  const canUnmortgage = (pos: number) => {
    const ts = tilesState[pos];
    if (!ts || ts.ownerId !== mySessionId || !ts.mortgaged) return false;
    const tile = BOARD[pos];
    if (!("mortgage" in tile)) return false;
    const cost = Math.round((tile as any).mortgage * 1.1);
    return (me?.cash || 0) >= cost;
  };

  // Always-visible holdings panel. Off-turn it is read-only: the list shows so
  // players can review what they own at any time, but the action buttons are
  // disabled until it is their turn (gated by `canManage`).
  const myPropertyManager = (
    <div style={{ borderTop: "1px solid var(--surface-2)", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase" }}>My Properties ({myProperties.length})</span>
        <button
          className="button-secondary"
          style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
          onClick={() => setShowTradeBuilder(true)}
          disabled={!canManage || players.length < 2 || activeTrade !== null}
          title={!canManage ? "Available on your turn" : "Propose a trade"}
        >
          🤝 Propose Trade
        </button>
      </div>

      {!canManage && myProperties.length > 0 && (
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontStyle: "italic", marginBottom: "0.4rem" }}>
          Viewing only — build, mortgage & trade unlock on your turn.
        </div>
      )}

      <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {myProperties.map((tile: any) => {
          const ts = tilesState[tile.pos];
          const isProp = tile.type === "property";
          return (
            <div key={tile.pos} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "0.35rem 0.5rem", borderRadius: "4px", border: "1px solid var(--surface-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                {isProp && (
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: `var(--color-${(tile as PropertyTile).group})` }} />
                )}
                <span style={{ fontSize: "0.8rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100px", whiteSpace: "nowrap" }}>
                  {tile.name}
                </span>
                {ts?.houses > 0 && (
                  <span style={{ fontSize: "0.75rem", background: "rgba(245, 158, 11, 0.15)", color: "var(--color-gold)", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
                    {getDevelopmentText(ts.houses)}
                  </span>
                )}
                {ts?.mortgaged && (
                  <span style={{ fontSize: "0.65rem", background: "rgba(239, 68, 68, 0.15)", color: "var(--color-danger)", padding: "1px 4px", borderRadius: "3px" }}>
                    M
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "2px" }}>
                {isProp && (
                  <>
                    <button
                      style={{ fontSize: "0.65rem", padding: "2px 5px", background: "rgba(16, 185, 129, 0.1)", color: "var(--color-naira)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "3px", cursor: "pointer" }}
                      disabled={!canManage || !canBuild(tile.pos)}
                      onClick={() => onSendAction({ type: "BUILD", pos: tile.pos })}
                      title={`Build (₦${(tile as PropertyTile).houseCost.toLocaleString()})`}
                    >
                      Build
                    </button>
                    <button
                      style={{ fontSize: "0.65rem", padding: "2px 5px", background: "rgba(239, 68, 68, 0.15)", color: "var(--color-danger)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "3px", cursor: "pointer" }}
                      disabled={!canManage || !canSellHouse(tile.pos)}
                      onClick={() => onSendAction({ type: "SELL_HOUSE", pos: tile.pos })}
                      title={`Sell ${getDevelopmentText(ts.houses)}`}
                    >
                      Sell
                    </button>
                  </>
                )}
                {!ts?.mortgaged ? (
                  <button
                    style={{ fontSize: "0.65rem", padding: "2px 5px", background: "rgba(245, 158, 11, 0.1)", color: "var(--color-gold)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "3px", cursor: "pointer" }}
                    disabled={!canManage || !canMortgage(tile.pos)}
                    onClick={() => onSendAction({ type: "MORTGAGE", pos: tile.pos })}
                    title={`Mortgage for +₦${("mortgage" in tile ? tile.mortgage : 0).toLocaleString()}`}
                  >
                    Mortgage
                  </button>
                ) : (
                  <button
                    style={{ fontSize: "0.65rem", padding: "2px 5px", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-naira)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "3px", cursor: "pointer" }}
                    disabled={!canManage || !canUnmortgage(tile.pos)}
                    onClick={() => onSendAction({ type: "UNMORTGAGE", pos: tile.pos })}
                    title={`Unmortgage for -₦${("mortgage" in tile ? Math.round(tile.mortgage * 1.1) : 0).toLocaleString()}`}
                  >
                    Lift Mort.
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {myProperties.length === 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "0.5rem" }}>
            You don't own any properties yet.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="console-panel glass-panel">
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "150px" }}>
        {/* Chat Header/Title */}
        <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "0.5rem" }}>
          💬 Room Chat
        </div>

        {/* Channel switcher: General (everyone) + a private channel per player */}
        <div className="chat-channel-bar">
          <button
            type="button"
            className={`chat-channel-chip ${chatChannel === "general" ? "active" : ""}`}
            onClick={() => setChatChannel("general")}
          >
            📢 General
            {chatChannel !== "general" && channelUnread["general"] > 0 && (
              <span className="chat-channel-dot">{channelUnread["general"]}</span>
            )}
          </button>
          {otherPlayers.map((p: any) => (
            <button
              key={p.id}
              type="button"
              className={`chat-channel-chip ${chatChannel === p.id ? "active" : ""}`}
              onClick={() => setChatChannel(p.id)}
              title={`Private chat with ${p.name}`}
            >
              🔒 {p.name}
              {chatChannel !== p.id && channelUnread[p.id] > 0 && (
                <span className="chat-channel-dot">{channelUnread[p.id]}</span>
              )}
            </button>
          ))}
        </div>

        <div id="game-chat-box" className="console-logs" style={{ flex: 1, minHeight: "100px" }}>
          {visibleMessages.length === 0 ? (
            <div className="chat-empty-msg" style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "1rem" }}>
              {chatChannel === "general"
                ? "No messages yet. Chat with everyone!"
                : `No private messages with ${activeChannelName} yet.`}
            </div>
          ) : (
            visibleMessages.map((msg: any, idx: number) => (
              <div key={idx} className="chat-msg-row" style={{ fontSize: "0.8rem", margin: "2px 0", border: "none" }}>
                <strong style={{ color: msg.senderId === mySessionId ? "var(--color-naira)" : "var(--color-gold)" }}>
                  {msg.toId && "🔒 "}
                  {tokenEmoji(msg.tokenId)} {msg.senderId === mySessionId ? "You" : msg.senderName}:
                </strong>{" "}
                <span style={{ color: "#fff" }}>{msg.text}</span>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem("chatText") as HTMLInputElement;
            if (input && input.value.trim()) {
              onSendChatMessage(input.value, chatChannel === "general" ? undefined : chatChannel);
              input.value = "";
            }
          }}
          style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
        >
          <input
            type="text"
            name="chatText"
            placeholder={chatChannel === "general" ? "Message everyone…" : `Whisper to ${activeChannelName}…`}
            className="input-field"
            autoComplete="off"
            style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.8rem", background: "rgba(0,0,0,0.4)" }}
          />
          <button type="submit" className="button-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", width: "auto" }}>Send</button>
        </form>
      </div>

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
            <h3 className="auction-title" style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "0.5rem" }}>
              🤝 Incoming Trade Offer
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
                onClick={() => onSendAction({ type: "RESPOND_TRADE", accept: true })}
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
            <h3 className="auction-title">🤝 Propose Trade Deal</h3>
            
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
                  .filter((p: any) => p.id !== mySessionId && !p.bankrupt)
                  .map((p: any) => (
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
                      max={players.find((p: any) => p.id === tradeTargetId)?.cash || 0}
                      step={10000}
                      value={tradeGetCash}
                      onChange={(e) => setTradeGetCash(Math.max(0, Number(e.target.value)))}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Max: ₦{players.find((p: any) => p.id === tradeTargetId)?.cash.toLocaleString()}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                  {/* Select tiles to give */}
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-secondary)" }}>Give Properties:</label>
                    <div style={{ maxHeight: "120px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "6px", marginTop: "0.25rem" }}>
                      {myProperties.filter((t: any) => (tilesState[t.pos]?.houses ?? 0) === 0).map((t: any) => (
                        <label key={t.pos} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", margin: "4px 0", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={tradeGiveTiles.includes(t.pos)}
                            onChange={() => toggleGiveTile(t.pos)}
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                      {myProperties.filter((t: any) => (tilesState[t.pos]?.houses ?? 0) === 0).length === 0 && (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" }}>No unimproved properties</div>
                      )}
                    </div>
                  </div>

                  {/* Select tiles to get */}
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--text-secondary)" }}>Request Properties:</label>
                    <div style={{ maxHeight: "120px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "0.5rem", borderRadius: "6px", marginTop: "0.25rem" }}>
                      {targetProperties.filter((t: any) => (tilesState[t.pos]?.houses ?? 0) === 0).map((t: any) => (
                        <label key={t.pos} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", margin: "4px 0", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={tradeGetTiles.includes(t.pos)}
                            onChange={() => toggleGetTile(t.pos)}
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                      {targetProperties.filter((t: any) => (tilesState[t.pos]?.houses ?? 0) === 0).length === 0 && (
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

      {/* Main HUD actions container */}
      <div className="action-controls">
        {/* Bankruptcy handling */}
        {me && me.cash < 0 && !isBankrupt && (
          <div className="auction-panel" style={{ borderColor: "var(--color-danger)", background: "rgba(239, 68, 68, 0.05)" }}>
            <div className="auction-title" style={{ color: "var(--color-danger)" }}>⚠️ NEGATIVE CASH DEBT</div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textAlign: "center" }}>
              Your cash balance is <strong style={{ color: "var(--color-danger)" }}>₦{me.cash.toLocaleString()}</strong>.
              You must sell houses or mortgage properties to clear debt, or declare bankruptcy.
            </p>
            <button
              className="button-primary"
              style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" }}
              onClick={() => onSendAction({ type: "DECLARE_BANKRUPT" })}
            >
              Declare Bankruptcy 💀
            </button>
          </div>
        )}

        {/* Trade pending status */}
        {activeTrade && activeTrade.fromId === mySessionId && (
          <div className="action-status-indicator" style={{ border: "1px solid var(--color-gold)", background: "rgba(245, 158, 11, 0.05)", borderRadius: "6px" }}>
            🤝 Waiting for recipient player to respond to your trade offer...
          </div>
        )}

        {/* Passive trade status */}
        {activeTrade && activeTrade.fromId !== mySessionId && activeTrade.toId !== mySessionId && (
          <div className="action-status-indicator" style={{ border: "1px solid rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.02)", borderRadius: "6px" }}>
            🤝 {players.find((p: any) => p.id === activeTrade.fromId)?.name || "Host"} is negotiating a trade deal with {players.find((p: any) => p.id === activeTrade.toId)?.name || "Player"}...
          </div>
        )}

        {/* Turn HUD and Action Buttons */}
        {isBankrupt ? (
          <div className="action-status-indicator">
            💀 You are bankrupt. You are now a spectator.
          </div>
        ) : isAuctionActive ? (
          /* Active Auction Panel */
          <div className={`auction-panel ${secsLeft <= 3 && auction.deadline ? "auction-urgent" : ""}`}>
            <div className="auction-title">🔨 LIVE AUCTION — BID FAST!</div>
            <div style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Tile: <strong>{BOARD[auction.tilePos].name}</strong> | Valuation: ₦{("price" in BOARD[auction.tilePos] ? (BOARD[auction.tilePos] as any).price : 0).toLocaleString()}
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
                  {secsLeft > 0 ? `${secsLeft}s` : "GOING, GONE!"}
                </div>
              </div>
            )}

            <div className="auction-bid-hud">
              <span>Top Bid: <strong style={{ color: "var(--color-naira)" }}>₦{auction.highestBid.toLocaleString()}</strong></span>
              <span>By: <strong>{auction.highestBidderId ? players.find((p: any) => p.id === auction.highestBidderId)?.name : "No bids yet"}</strong></span>
            </div>

            {canBid ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
                <div className="action-status-indicator" style={{ color: "var(--color-gold)", fontWeight: "bold" }}>
                  Raise the bid 👇
                </div>
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
                      >
                        ▲ ₦{inc.toLocaleString()}
                        <span className="bid-increment-total">₦{total.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="button-secondary"
                  onClick={() => onSendAction({ type: "PASS_BID" })}
                >
                  Pass (Leave Auction)
                </button>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
                  Your cash: ₦{me?.cash.toLocaleString()}
                </div>
              </div>
            ) : iAmHighest ? (
              <div className="action-status-indicator" style={{ color: "var(--color-naira)", fontWeight: "bold" }}>
                🥇 You hold the top bid — hang on!
              </div>
            ) : iPassed ? (
              <div className="action-status-indicator">
                You folded. Watching the rest fight it out…
              </div>
            ) : (
              <div className="action-status-indicator">
                Spectating the auction…
              </div>
            )}
          </div>
        ) : (
          /* Non-auction: your-turn actions or a waiting note, plus always-visible holdings */
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {isMyTurn ? (
            <>
            <div className="action-status-indicator" style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
              🟢 It is <strong style={{ color: "var(--color-naira)" }}>YOUR TURN</strong>!
            </div>

            {engineState.phase === "awaiting-roll" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {me?.inJail ? (
                  <>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-danger)", textAlign: "center", fontStyle: "italic" }}>
                      You are in Kirikiri Prison (Jail Attempt {me.jailTurns}/3).
                    </div>
                    <div className="action-buttons-grid">
                      <button className="button-primary full-width-btn" onClick={() => onSendAction({ type: "ROLL" })}>
                        Roll for Doubles 🎲
                      </button>
                      <button className="button-secondary" onClick={() => onSendAction({ type: "PAY_JAIL_FINE" })} disabled={(me?.cash || 0) < 50000}>
                        Pay ₦50,000 Fine
                      </button>
                      <button
                        className="button-secondary"
                        onClick={() => onSendAction({ type: "USE_JAIL_CARD" })}
                        disabled={(me?.getOutOfJailCards || 0) === 0}
                      >
                        Use Jail Card ({me?.getOutOfJailCards || 0})
                      </button>
                    </div>
                  </>
                ) : (
          <motion.button
            className="button-primary full-width-btn"
            style={{ padding: "1rem" }}
            onClick={() => onSendAction({ type: "ROLL" })}
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            Roll Dice 🎲
          </motion.button>
                )}
              </div>
            )}

            {engineState.phase === "awaiting-buy-decision" && (
              <div className="auction-panel" style={{ borderColor: "var(--color-gold)", background: "rgba(245, 158, 11, 0.03)" }}>
                {(() => {
                  const tile = BOARD[me?.position];
                  const price = tile && "price" in tile ? tile.price : 0;
                  return (
                    <>
                      <div style={{ textAlign: "center", fontSize: "0.9rem" }}>
                        Landed on unowned: <strong>{tile?.name}</strong>
                      </div>
                      <div style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                        Price: <strong style={{ color: "var(--color-naira)" }}>₦{price.toLocaleString()}</strong>
                      </div>
                      <div className="action-buttons-grid">
                        <button
                          className="button-primary"
                          disabled={(me?.cash || 0) < price}
                          onClick={() => onSendAction({ type: "BUY" })}
                        >
                          Buy Property ₦
                        </button>
                        <button className="button-secondary" onClick={() => onSendAction({ type: "DECLINE_BUY" })}>
                          Decline (Auction)
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {engineState.phase === "awaiting-end-turn" && (
              <button
                className="button-primary full-width-btn"
                style={{ padding: "0.9rem" }}
                disabled={me?.cash < 0}
                onClick={() => onSendAction({ type: "END_TURN" })}
                title={me?.cash < 0 ? "You must mortgage properties, sell houses, or declare bankruptcy before ending your turn." : "End Turn 🏁"}
              >
                {me?.cash < 0 ? "Resolve Debt to End Turn 🏁" : "End Turn 🏁"}
              </button>
            )}

            </>
            ) : (
              <div className="action-status-indicator">
                ⏳ Waiting for <strong>{players[engineState.currentPlayerIndex]?.name || "other players"}</strong> to act...
              </div>
            )}

            {/* Holdings are always visible; the action buttons enable only on your turn */}
            {myPropertyManager}
          </div>
        )}
      </div>
    </div>
  );
}
