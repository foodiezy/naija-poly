import { useState, useEffect } from "react";
import { Room } from "colyseus.js";
import { tokenEmoji } from "../../data/tokens";
import { GameState, Player } from "../../engine/types";
import { ChatMessage } from "../../shared/chat";

interface ChatPanelProps {
  room: Room;
  engineState: GameState;
  chatMessages: ChatMessage[];
  onSendChatMessage: (text: string, toId?: string) => void;
}

// Left-column room chat: a "General" channel plus a private channel per other
// player. Lifted out of ControlPanel so chat lives on the left while the game
// controls live on the right.
export default function ChatPanel({ room, engineState, chatMessages, onSendChatMessage }: ChatPanelProps) {
  const [chatChannel, setChatChannel] = useState<string>("general");
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({});
  const [lastMessageCount, setLastMessageCount] = useState(0);

  const mySessionId = room.sessionId;
  const players = engineState?.players || [];

  // Which channel a message belongs to from MY perspective: "general" for
  // broadcasts, otherwise the other party's id for private/direct messages.
  const channelOf = (msg: ChatMessage) => {
    if (!msg?.toId) return "general";
    return msg.senderId === mySessionId ? msg.toId : msg.senderId;
  };

  // Keep the chat scrolled to the newest message in the active channel.
  useEffect(() => {
    const chatElement = document.getElementById("game-chat-box");
    if (chatElement) {
      chatElement.scrollTop = chatElement.scrollHeight;
    }
  }, [chatMessages, chatChannel]);

  // Track unread counts per channel for messages that arrive while I'm not
  // looking at that channel (and that I didn't send myself).
  useEffect(() => {
    if (chatMessages.length > lastMessageCount) {
      const fresh = chatMessages.slice(lastMessageCount);
      setChannelUnread((prev) => {
        const next = { ...prev };
        fresh.forEach((m: ChatMessage) => {
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

  if (!engineState) return null;

  const otherPlayers = players.filter((p: Player) => p.id !== mySessionId);
  const visibleMessages = chatMessages.filter((m: ChatMessage) => channelOf(m) === chatChannel);
  const activeChannelName =
    chatChannel === "general"
      ? "Everyone"
      : players.find((p: Player) => p.id === chatChannel)?.name || "Player";

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
          {otherPlayers.map((p: Player) => (
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
            visibleMessages.map((msg: ChatMessage, idx: number) => (
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
    </div>
  );
}
