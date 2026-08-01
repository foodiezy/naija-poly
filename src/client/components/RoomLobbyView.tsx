import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { TOKENS, tokenEmoji } from "../../data/tokens";
import { Room } from "colyseus.js";
import { ChatMessage } from "../../shared/chat";
import { RoomState, RoomSettings, LobbyPlayerView } from "../../shared/room";
import { countHumans } from "../lib/players";

// Starting cash is a FIXED set of presets — the host picks one of these, not an
// arbitrary amount. Keeps games balanced and the choice quick. All values sit
// inside the server-side cash clamp (100k–10M).
const CASH_PRESETS: { value: number; label: string }[] = [
  { value: 500_000, label: "₦500K" },
  { value: 1_000_000, label: "₦1M" },
  { value: 1_500_000, label: "₦1.5M" },
  { value: 3_000_000, label: "₦3M" },
  { value: 5_000_000, label: "₦5M" },
];

function CashPresetRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: "0.55rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.4rem",
        }}
      >
        <label style={{ margin: 0, fontSize: "0.9rem" }}>Starting Cash</label>
        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-gold, #e8b64a)" }}>
          ₦{value.toLocaleString()}
        </span>
      </div>
      <div className="cash-preset-grid">
        {CASH_PRESETS.map((p) => {
          const active = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              aria-pressed={active}
              style={{
                padding: "0.45rem 0.2rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                borderRadius: "6px",
                cursor: "pointer",
                border: active
                  ? "1px solid var(--color-gold, #e8b64a)"
                  : "1px solid rgba(255,255,255,0.15)",
                background: active ? "var(--color-gold, #e8b64a)" : "transparent",
                color: active ? "#1a1a2e" : "var(--text-secondary)",
                transition: "all 0.15s ease",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const humanCount = countHumans(roomState?.lobbyPlayers ? roomState.lobbyPlayers.keys() : []);

  // Waiting timer: while the room can't start yet (fewer than 2 players), count
  // how long we've been waiting so the host knows to nudge friends. Capped at
  // 5:00 so it never counts up forever.
  const [waitSecs, setWaitSecs] = useState(0);
  useEffect(() => {
    if (playerCount >= 2) {
      setWaitSecs(0);
      return;
    }
    const id = setInterval(() => setWaitSecs((s) => Math.min(s + 1, 300)), 1000);
    return () => clearInterval(id);
  }, [playerCount]);
  const waitLabel = `${Math.floor(waitSecs / 60)}:${(waitSecs % 60)
    .toString()
    .padStart(2, "0")}${waitSecs >= 300 ? "+" : ""}`;

  // Social share: prefilled invite for WhatsApp / X / Telegram, plus the native
  // share sheet on devices that support it. Same ?room= link the copy button uses.
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
  const shareMsg = `🎲 Join my Odogwu Empire game — buy Naija land, collect rent & bankrupt your friends! Room ${room.roomId}:`;
  const shareFull = `${shareMsg} ${inviteUrl}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(shareFull)}`;
  const xLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareMsg,
  )}&url=${encodeURIComponent(inviteUrl)}`;
  const tgLink = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(
    shareMsg,
  )}`;
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: "Odogwu Empire", text: shareMsg, url: inviteUrl });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };
  const shareBtnStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
    padding: "0.5rem 0.4rem",
    fontSize: "0.8rem",
    fontWeight: 700,
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    textDecoration: "none",
  };

  return (
    <div className="lobby-columns-container">
      <div className="lobby-card glass-panel">
        <h2 className="lobby-title">Room Lobby</h2>
        <button
          className="button-secondary full-width-btn"
          style={{ border: "1px solid var(--color-gold, #e8b64a)" }}
          onClick={onCopyRoomCode}
        >
          🔗 Copy invite link
        </button>

        {/* Share the invite straight to a social app with a prefilled message. */}
        <div className="lobby-share-row">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            style={shareBtnStyle}
            title="Share on WhatsApp"
          >
            🟢 WhatsApp
          </a>
          <a
            href={xLink}
            target="_blank"
            rel="noopener noreferrer"
            style={shareBtnStyle}
            title="Share on X"
          >
            ✖️ X
          </a>
          <a
            href={tgLink}
            target="_blank"
            rel="noopener noreferrer"
            style={shareBtnStyle}
            title="Share on Telegram"
          >
            ✈️ Telegram
          </a>
          {canNativeShare && (
            <button type="button" style={shareBtnStyle} onClick={handleNativeShare} title="Share…">
              📲 Share
            </button>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "0.82rem",
            margin: 0,
          }}
        >
          Share code {room.roomId} — copy the link or send it to a friend.
        </p>

        {/* Waiting indicator: a room needs at least 2 players to start. */}
        {playerCount < 2 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.15rem",
              padding: "0.5rem",
              borderRadius: "var(--radius-md)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              ⏱ Waiting for players… {waitLabel}
            </span>
            {waitSecs >= 60 && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
                Nobody's joined yet — share the invite{isHost ? " or add a bot 🤖" : ""}.
              </span>
            )}
          </div>
        )}
        {isHost && (
          <p
            style={{
              textAlign: "center",
              color: "var(--color-gold, #e8b64a)",
              fontSize: "0.8rem",
              margin: 0,
            }}
          >
            Invite friends before you start — the room locks once the game begins.
          </p>
        )}

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
                  className={`token-option ${isMine ? "selected" : ""} ${takenBy ? "taken" : ""}`}
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
          <div
            className="form-group"
            style={{
              marginTop: 0,
              background: "rgba(0,0,0,0.2)",
              padding: "0.85rem",
              borderRadius: "var(--radius-md)",
            }}
          >
            <h3
              style={{ fontSize: "0.95rem", margin: "0 0 0.6rem", color: "var(--text-secondary)" }}
            >
              ⚙️ Host Settings
            </h3>

            <CashPresetRow
              value={roomState?.startingCash || 1500000}
              onChange={(v) => onUpdateSettings({ startingCash: v })}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.55rem",
              }}
            >
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

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9rem",
                cursor: "pointer",
                marginBottom: "0.55rem",
              }}
            >
              <input
                type="checkbox"
                checked={roomState?.freeParkingJackpot || false}
                onChange={(e) => onUpdateSettings({ freeParkingJackpot: e.target.checked })}
              />
              Mama Put Rest Stop Jackpot
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                fontSize: "0.9rem",
                cursor: "pointer",
                marginBottom: "0.55rem",
              }}
            >
              <input
                type="checkbox"
                checked={roomState?.chaosMode || false}
                onChange={(e) => onUpdateSettings({ chaosMode: e.target.checked })}
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                ⚡ Chaos Mode
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Adds Naija chaos cards — e.g. "NEPA don take light" freezes all rent for a round.
                </span>
              </span>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9rem",
                cursor: "pointer",
                marginBottom: "0.55rem",
              }}
            >
              <input
                type="checkbox"
                checked={roomState?.secretObjectives || false}
                onChange={(e) => onUpdateSettings({ secretObjectives: e.target.checked })}
              />
              Secret Objectives
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9rem",
                cursor: "pointer",
                marginBottom: "0.5rem",
              }}
            >
              <input
                type="checkbox"
                checked={roomState?.turnTimerEnabled ?? false}
                onChange={(e) => onUpdateSettings({ turnTimerEnabled: e.target.checked })}
              />
              Enable Turn Timer
            </label>

            {(roomState?.turnTimerEnabled ?? false) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingLeft: "1.5rem",
                }}
              >
                <label style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Seconds per turn
                </label>
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
            style={{ padding: "0.6rem", fontSize: "0.95rem" }}
            onClick={onAddAI}
            disabled={roomFull}
            title={roomFull ? "Room is full" : "Add a bot opponent"}
          >
            {roomFull ? "Room Full" : "➕ Add Bot Player 🤖"}
          </button>
        )}

        {isHost ? (
          <>
            <button
              className="button-primary full-width-btn"
              style={{ padding: "1rem", fontSize: "1.1rem" }}
              onClick={onStartGame}
              disabled={playerCount < 2}
            >
              {playerCount < 2 ? "Waiting for more players..." : "Start Game 🎲"}
            </button>
            {humanCount === 1 && playerCount >= 2 && (
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  textAlign: "center",
                  marginTop: "0.5rem",
                }}
              >
                Playing solo with bots — friends can't join once you start.
              </span>
            )}
          </>
        ) : (
          <div
            className="status-indicator"
            style={{
              padding: "1rem",
              textAlign: "center",
              background: "rgba(0,0,0,0.2)",
              borderRadius: "var(--radius-md)",
            }}
          >
            ⏳ Waiting for host to start the game...
          </div>
        )}
      </div>

      <div className="lobby-card glass-panel" style={{ display: "flex", flexDirection: "column" }}>
        <h2 className="lobby-title">Players Joined ({roomState?.lobbyPlayers?.size || 0})</h2>
        <div className="lobby-players-list">
          {roomState?.lobbyPlayers &&
            Array.from(
              roomState.lobbyPlayers.entries() as IterableIterator<[string, LobbyPlayerView]>,
            ).map(([pId, pData]) => (
              <motion.div
                key={pId}
                className="lobby-player-row"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="lobby-player-token">{tokenEmoji(pData.tokenId)}</span>
                <span className="lobby-player-name">
                  {pData.name} {pId === room.sessionId && "(You)"}
                </span>
                {pId === roomState.hostId && <span className="lobby-host-badge">HOST</span>}
              </motion.div>
            ))}
        </div>

        <h3 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem", color: "var(--text-secondary)" }}>
          Lobby Chat
        </h3>
        <div
          id="lobby-chat-box"
          className="chat-messages-container"
          style={{ flexGrow: 1, minHeight: "150px" }}
        >
          {chatMessages
            .filter((m) => !m.toId)
            .map((msg: ChatMessage, idx: number) => (
              <div
                key={idx}
                className={`chat-message ${msg.senderId === room.sessionId ? "my-message" : "other-message"}`}
              >
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
    </div>
  );
}
