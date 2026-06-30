import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TOKENS, tokenEmoji } from "../../data/tokens";
import { Room } from "colyseus.js";
import { ChatMessage } from "../../shared/chat";
import { RoomState, RoomSettings, LobbyPlayerView } from "../../shared/room";
import { ALL_TRIVIA } from "../../data/facts";

interface RoomLobbyViewProps {
  room: Room;
  roomState: RoomState | null;
  onCopyRoomCode: () => void;
  onSelectToken: (tokenId: string) => void;
  onAddAI: () => void;
  onUpdateSettings: (settings: RoomSettings) => void;
  onStartGame: () => void;
  chatMessages: ChatMessage[];
  onSendChatMessage: (text: string) => void;
}

export default function RoomLobbyView({
  room,
  roomState,
  onCopyRoomCode,
  onSelectToken,
  onAddAI,
  onUpdateSettings,
  onStartGame,
  chatMessages,
  onSendChatMessage,
}: RoomLobbyViewProps) {
  const isHost = roomState?.hostId === room.sessionId;
  const playerCount = roomState?.lobbyPlayers?.size ?? 0;
  const roomFull = playerCount >= 6;
  const myTokenId = roomState?.lobbyPlayers?.get(room.sessionId)?.tokenId;

  const [triviaIdx, setTriviaIdx] = useState(() => Math.floor(Math.random() * ALL_TRIVIA.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setTriviaIdx(prev => (prev + 1) % ALL_TRIVIA.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="lobby-columns-container">
      <div className="lobby-card glass-panel">
        <h2 className="lobby-title">Room Lobby</h2>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Share code{" "}
          <strong
            style={{ color: "#3b82f6", cursor: "pointer" }}
            onClick={onCopyRoomCode}
            title="Click to copy"
          >
            {room.roomId} 📋
          </strong>{" "}
          with friends to join.
        </p>
        
        <div className="form-group">
          <label>Select Your Token Piece:</label>
          <div className="token-grid">
            {TOKENS.map((token) => {
              // Check if token is taken by SOMEONE ELSE
              let takenBy = null;
              if (roomState?.lobbyPlayers) {
                for (const [pId, pData] of roomState.lobbyPlayers.entries()) {
                  if (pData.tokenId === token.id && pId !== room.sessionId) {
                    takenBy = pData.name;
                    break;
                  }
                }
              }
              const isMine = myTokenId === token.id;
              
              return (
                <button
                  key={token.id}
                  className={`token-btn ${isMine ? "selected" : ""} ${takenBy ? "taken" : ""}`}
                  disabled={!!takenBy}
                  onClick={() => onSelectToken(token.id)}
                  title={takenBy ? `Taken by ${takenBy}` : token.name}
                >
                  <span className="token-emoji">{token.emoji}</span>
                  <span className="token-name">{token.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {isHost && (
          <div className="form-group" style={{ marginTop: "1rem", background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>⚙️ Host Settings</h3>
            
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <label style={{ margin: 0, fontSize: "0.9rem" }}>Starting Cash (₦)</label>
              <input
                type="number"
                className="input-field"
                style={{ width: "120px", padding: "0.4rem 0.75rem" }}
                value={roomState?.startingCash || 1500000}
                min={100000}
                max={5000000}
                step={100000}
                onChange={(e) => onUpdateSettings({ startingCash: Number(e.target.value) })}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <label style={{ margin: 0, fontSize: "0.9rem" }}>Turn Limit (0 = ∞)</label>
              <input
                type="number"
                className="input-field"
                style={{ width: "120px", padding: "0.4rem 0.75rem" }}
                value={roomState?.turnLimit || 0}
                min={0}
                max={500}
                onChange={(e) => onUpdateSettings({ turnLimit: Number(e.target.value) })}
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", cursor: "pointer", marginBottom: "0.75rem" }}>
              <input
                type="checkbox"
                checked={roomState?.freeParkingJackpot || false}
                onChange={(e) => onUpdateSettings({ freeParkingJackpot: e.target.checked })}
              />
              Mama Put Rest Stop Jackpot
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", cursor: "pointer", marginBottom: "0.5rem" }}>
              <input
                type="checkbox"
                checked={roomState?.turnTimerEnabled ?? false}
                onChange={(e) => onUpdateSettings({ turnTimerEnabled: e.target.checked })}
              />
              Enable Turn Timer
            </label>
            
            {(roomState?.turnTimerEnabled ?? false) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: "1.5rem" }}>
                <label style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>Seconds per turn</label>
                <input
                  type="number"
                  className="input-field"
                  style={{ width: "90px", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                  value={roomState?.turnTimeoutSecs || 120}
                  min={15}
                  max={600}
                  step={15}
                  onChange={(e) => onUpdateSettings({ turnTimeoutSecs: Number(e.target.value) })}
                />
              </div>
            )}
          </div>
        )}

        {isHost && (
          <button
            className="button-secondary full-width-btn"
            style={{ padding: "0.75rem", fontSize: "0.95rem", marginBottom: "0.75rem" }}
            onClick={onAddAI}
            disabled={roomFull}
            title={roomFull ? "Room is full" : "Add a bot opponent"}
          >
            {roomFull ? "Room Full" : "➕ Add Bot Player 🤖"}
          </button>
        )}

        {isHost ? (
          <button
            className="button-primary full-width-btn"
            style={{ padding: "1rem", fontSize: "1.1rem" }}
            onClick={onStartGame}
            disabled={playerCount < 2}
          >
            {playerCount < 2
              ? "Waiting for more players..."
              : "Start Game 🎲"}
          </button>
        ) : (
          <div className="status-indicator" style={{ padding: "1rem", textAlign: "center", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
            ⏳ Waiting for host to start the game...
          </div>
        )}
      </div>
      
      <div className="lobby-card glass-panel" style={{ display: "flex", flexDirection: "column" }}>
        <h2 className="lobby-title">Players Joined ({roomState?.lobbyPlayers?.size || 0})</h2>
        <div className="lobby-players-list">
          {roomState?.lobbyPlayers && Array.from(roomState.lobbyPlayers.entries() as IterableIterator<[string, LobbyPlayerView]>).map(([pId, pData]) => (
            <motion.div
              key={pId}
              className="lobby-player-row"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <span className="lobby-player-token">{tokenEmoji(pData.tokenId)}</span>
              <span className="lobby-player-name">{pData.name} {pId === room.sessionId && "(You)"}</span>
              {pId === roomState.hostId && <span className="lobby-host-badge">HOST</span>}
            </motion.div>
          ))}
        </div>
        
        <h3 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem", color: "var(--text-secondary)" }}>Lobby Chat</h3>
        <div id="lobby-chat-box" className="chat-messages-container" style={{ flexGrow: 1, minHeight: "150px" }}>
          {chatMessages.filter(m => !m.toId).map((msg: ChatMessage, idx: number) => (
            <div key={idx} className={`chat-message ${msg.senderId === room.sessionId ? 'my-message' : 'other-message'}`}>
              <span className="chat-sender">{msg.senderName}:</span> {msg.text}
            </div>
          ))}
        </div>
        <div className="chat-input-row" style={{ marginTop: "0.5rem" }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Type a message..." 
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                onSendChatMessage(e.currentTarget.value.trim());
                e.currentTarget.value = "";
              }
            }}
          />
        </div>
      </div>

      {/* Trivia Ticker — shown while players wait */}
      <div className="lobby-trivia-ticker">
        <span className="trivia-label">🇳🇬 Did you know?</span>
        <AnimatePresence mode="wait">
          <motion.p
            key={triviaIdx}
            className="trivia-text"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            {ALL_TRIVIA[triviaIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
