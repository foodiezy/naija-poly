import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BOARD, PropertyTile } from "../../data/board";
import { TradeOffer } from "../../engine/types";

interface ControlPanelProps {
  room: any;
  engineState: any;
  onSendAction: (action: any) => void;
  chatMessages: any[];
  onSendChatMessage: (text: string) => void;
}

export default function ControlPanel({ room, engineState, onSendAction, chatMessages, onSendChatMessage }: ControlPanelProps) {
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"logs" | "chat">("logs");
  const [unreadChats, setUnreadChats] = useState<number>(0);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  useEffect(() => {
    if (chatMessages.length > lastMessageCount) {
      if (activeTab !== "chat") {
        setUnreadChats((prev) => prev + (chatMessages.length - lastMessageCount));
      }
      setLastMessageCount(chatMessages.length);
    } else if (chatMessages.length === 0) {
      setUnreadChats(0);
      setLastMessageCount(0);
    }
  }, [chatMessages.length, activeTab, lastMessageCount]);

  const handleTabChange = (tab: "logs" | "chat") => {
    setActiveTab(tab);
    if (tab === "chat") {
      setUnreadChats(0);
    }
  };

  useEffect(() => {
    if (activeTab === "chat") {
      const chatElement = document.getElementById("game-chat-box");
      if (chatElement) {
        chatElement.scrollTop = chatElement.scrollHeight;
      }
    }
  }, [chatMessages, activeTab]);
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

  // Auto-fill minimum bid when auction changes or when it is my bid turn
  const auction = engineState?.auctionState;
  const isAuctionActive = engineState?.phase === "auction" && auction;
  const isMyBidTurn = isAuctionActive && auction.activePlayerIds[auction.currentPlayerIndex] === mySessionId;
  
  useEffect(() => {
    if (isMyBidTurn && auction) {
      setBidAmount(auction.highestBid + 10000);
    }
  }, [isMyBidTurn, auction?.highestBid]);

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

  const getDevelopmentText = (houses: number) => {
    switch (houses) {
      case 5: return "🏢 Banana Tower";
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

  // Helper to categorize log styles
  const getLogClass = (logLine: string) => {
    if (logLine.includes("rolled") || logLine.includes("START") || logLine.includes("Prison") || logLine.includes("escaped")) {
      return "log-entry log-entry-system";
    }
    if (logLine.includes("bought")) {
      return "log-entry log-entry-buy";
    }
    if (logLine.includes("paid rent") || logLine.includes("paid ₦") || logLine.includes("tax")) {
      return "log-entry log-entry-rent";
    }
    return "log-entry";
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

  return (
    <div className="console-panel glass-panel">
      {/* Tabs Header */}
      <div className="panel-tabs" style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
        <button
          className={`panel-tab-btn ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => handleTabChange("logs")}
          style={{
            background: activeTab === "logs" ? "rgba(255,255,255,0.05)" : "transparent",
            border: "none",
            color: activeTab === "logs" ? "var(--text-primary)" : "var(--text-muted)",
            padding: "0.4rem 0.8rem",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          Game Feed
        </button>
        <button
          className={`panel-tab-btn ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => handleTabChange("chat")}
          style={{
            background: activeTab === "chat" ? "rgba(255,255,255,0.05)" : "transparent",
            border: "none",
            color: activeTab === "chat" ? "var(--text-primary)" : "var(--text-muted)",
            padding: "0.4rem 0.8rem",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            position: "relative",
            transition: "all 0.2s"
          }}
        >
          Room Chat
          {unreadChats > 0 && (
            <span style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "var(--color-danger)",
              color: "#fff",
              fontSize: "0.65rem",
              borderRadius: "50%",
              minWidth: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              boxShadow: "0 0 5px rgba(239, 68, 68, 0.5)"
            }}>
              {unreadChats}
            </span>
          )}
        </button>
      </div>

      {activeTab === "logs" ? (
        <div id="console-logs-box" className="console-logs">
          <AnimatePresence initial={false}>
            {engineState.log?.map((logLine: string, idx: number) => (
              <motion.div
                key={idx}
                className={getLogClass(logLine)}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {logLine}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "150px" }}>
          <div id="game-chat-box" className="console-logs" style={{ flex: 1, minHeight: "100px" }}>
            {chatMessages.length === 0 ? (
              <div className="chat-empty-msg" style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "1rem" }}>
                No messages yet. Chat with other players!
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className="chat-msg-row" style={{ fontSize: "0.8rem", margin: "2px 0", border: "none" }}>
                  <strong style={{ color: msg.senderId === mySessionId ? "var(--color-naira)" : "var(--color-gold)" }}>
                    {msg.tokenId === "danfo_bus" ? "🚌" : msg.tokenId === "okada" ? "🏍️" : msg.tokenId === "agbada" ? "🧥" : msg.tokenId === "eagle" ? "🦅" : "👤"} {msg.senderName}:
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
                onSendChatMessage(input.value);
                input.value = "";
              }
            }}
            style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
          >
            <input
              type="text"
              name="chatText"
              placeholder="Send message..."
              className="input-field"
              autoComplete="off"
              style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.8rem", background: "rgba(0,0,0,0.4)" }}
            />
            <button type="submit" className="button-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", width: "auto" }}>Send</button>
          </form>
        </div>
      )}

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
          <div className="auction-panel">
            <div className="auction-title">🔨 AUCTION IN PROGRESS</div>
            <div style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Tile: <strong>{BOARD[auction.tilePos].name}</strong> | Valuation: ₦{("price" in BOARD[auction.tilePos] ? (BOARD[auction.tilePos] as any).price : 0).toLocaleString()}
            </div>
            
            <div className="auction-bid-hud">
              <span>Highest Bid: <strong style={{ color: "var(--color-naira)" }}>₦{auction.highestBid.toLocaleString()}</strong></span>
              <span>By: <strong>{auction.highestBidderId ? players.find((p: any) => p.id === auction.highestBidderId)?.name : "None"}</strong></span>
            </div>

            {isMyBidTurn ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                <div className="action-status-indicator" style={{ color: "var(--color-gold)", fontWeight: "bold" }}>
                  It is your turn to BID!
                </div>
                <div className="bid-input-wrapper">
                  <input
                    type="number"
                    className="bid-input"
                    style={{ flex: 1 }}
                    step={10000}
                    min={auction.highestBid + 1}
                    max={me?.cash || 0}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Math.max(auction.highestBid + 1, Number(e.target.value)))}
                  />
                  <button
                    className="button-primary"
                    disabled={(me?.cash || 0) < bidAmount || bidAmount <= auction.highestBid}
                    onClick={() => onSendAction({ type: "BID", amount: bidAmount })}
                  >
                    Bid ₦{bidAmount.toLocaleString()}
                  </button>
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
            ) : (
              <div className="action-status-indicator">
                Waiting for <strong>{players.find((p: any) => p.id === auction.activePlayerIds[auction.currentPlayerIndex])?.name}</strong> to bid...
              </div>
            )}
          </div>
        ) : isMyTurn ? (
          /* Active Turn Actions */
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
              <button className="button-primary full-width-btn" style={{ padding: "0.9rem" }} onClick={() => onSendAction({ type: "END_TURN" })}>
                End Turn 🏁
              </button>
            )}

            {/* General administration sub-actions (Build/Mortgage/Trade) */}
            {(engineState.phase === "awaiting-roll" || engineState.phase === "awaiting-end-turn") && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase" }}>My Properties ({myProperties.length})</span>
                  <button
                    className="button-secondary"
                    style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => setShowTradeBuilder(true)}
                    disabled={players.length < 2 || activeTrade !== null}
                  >
                    🤝 Propose Trade
                  </button>
                </div>
                
                <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {myProperties.map((tile: any) => {
                    const ts = tilesState[tile.pos];
                    const isProp = tile.type === "property";
                    return (
                      <div key={tile.pos} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "0.35rem 0.5rem", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.03)" }}>
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
                                disabled={!canBuild(tile.pos)}
                                onClick={() => onSendAction({ type: "BUILD", pos: tile.pos })}
                                title={`Build (₦${(tile as PropertyTile).houseCost.toLocaleString()})`}
                              >
                                Build
                              </button>
                              <button
                                style={{ fontSize: "0.65rem", padding: "2px 5px", background: "rgba(239, 68, 68, 0.15)", color: "var(--color-danger)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "3px", cursor: "pointer" }}
                                disabled={!canSellHouse(tile.pos)}
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
                              disabled={!canMortgage(tile.pos)}
                              onClick={() => onSendAction({ type: "MORTGAGE", pos: tile.pos })}
                              title={`Mortgage for +₦${("mortgage" in tile ? tile.mortgage : 0).toLocaleString()}`}
                            >
                              Mortgage
                            </button>
                          ) : (
                            <button
                              style={{ fontSize: "0.65rem", padding: "2px 5px", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-naira)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "3px", cursor: "pointer" }}
                              disabled={!canUnmortgage(tile.pos)}
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
            )}
          </div>
        ) : (
          /* Spectator / Other player's turn */
          <div className="action-status-indicator">
            ⏳ Waiting for <strong>{players[engineState.currentPlayerIndex]?.name || "other players"}</strong> to act...
          </div>
        )}
      </div>
    </div>
  );
}
