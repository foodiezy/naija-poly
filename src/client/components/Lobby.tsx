import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getStats } from "../utils/stats";

interface LobbyProps {
  onCreateRoom: (name: string) => Promise<void>;
  onJoinRoom: (name: string, roomId: string) => Promise<void>;
  onQuickMatch?: (name: string) => Promise<void>;
  // Room code from an invite link (?room=CODE); prefills the join field.
  initialRoomId?: string;
}

// Written for people who have NEVER played Monopoly. Each step says exactly
// what you tap and what happens next — no board-game jargon assumed.
const HOW_TO_PLAY = [
  {
    emoji: "🚗",
    color: "#e8b64a",
    title: "Pick your token — that's you",
    desc: "Your token is your playing piece (danfo bus, keke, agbada man…). It's how the board shows where you are. Choose one in the room, then watch it move around the board as you play.",
  },
  {
    emoji: "🎲",
    color: "#e8b64a",
    title: "Tap ROLL to move",
    desc: "On your turn, tap ROLL. Two dice decide how many steps your token waka forward around the board. Roll the same number on both dice (doubles)? You get to roll again!",
  },
  {
    emoji: "🏘️",
    color: "#3b82f6",
    title: "Land on land → buy it",
    desc: "Wherever your token stops, if that property has no owner, you can buy it with your Naira. Own it and it's yours for the rest of the game. Say no? It goes to auction for everyone to bid.",
  },
  {
    emoji: "💸",
    color: "#ef4444",
    title: "Owning land earns you rent",
    desc: "When another player's token lands on YOUR property, they must pay you rent automatically. Collect a full colour group (all properties of one colour) and the rent multiplies — that's how you get rich.",
  },
  {
    emoji: "🏗️",
    color: "#46c78d",
    title: "Build to charge more",
    desc: "Once you own a whole colour group, spend cash to build on it: Bungalow → Duplex → Mansion → Hotel. Each upgrade makes opponents pay far more when they land there.",
  },
  {
    emoji: "🤝",
    color: "#8b5cf6",
    title: "Trade & make deals",
    desc: "Anytime, you can offer other players a swap — cash, properties, jail cards — to complete a colour group. Both sides must agree for the deal to go through.",
  },
  {
    emoji: "🏆",
    color: "#e8b64a",
    title: "Bankrupt everyone to win",
    desc: "If a player can't pay what they owe, they're out. The last player left with money standing is the Odogwu. E get level!",
  },
];

export default function Lobby({
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  initialRoomId,
}: LobbyProps) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [loading, setLoading] = useState(false);
  const stats = getStats();
  // Auto-open the rules for first-time visitors (no saved games yet); returning
  // players start collapsed so they can get straight to creating a room.
  const [showHowToPlay, setShowHowToPlay] = useState(stats.gamesPlayed === 0);
  const invited = !!initialRoomId;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreateRoom(name.trim());
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !roomId.trim()) return;
    setLoading(true);
    try {
      await onJoinRoom(name.trim(), roomId.trim());
    } finally {
      setLoading(false);
    }
  };

  // Enter in the name field: when the player arrived via an invite link, the
  // natural action is to JOIN the invited room, not create a brand-new one.
  const handleNameSubmit = (e: React.FormEvent) => {
    if (invited && roomId.trim()) {
      handleJoin(e);
    } else {
      handleCreate(e);
    }
  };

  return (
    <div className="lobby-landing-page">
      {/* Hero Section */}
      <motion.div
        className="lobby-hero"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="lobby-logo-block"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
        >
          <h1 className="lobby-logo-text">Odogwu Empire</h1>
        </motion.div>
        <motion.p
          className="lobby-tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          Buy the land. Become the Odogwu.
        </motion.p>
      </motion.div>

      {/* Invite banner — shown when arriving via a shared ?room= link */}
      {invited && (
        <motion.div
          className="glass-panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.15 }}
          style={{
            width: "100%",
            marginBottom: "1rem",
            padding: "1rem 1.25rem",
            textAlign: "center",
            border: "1px solid var(--color-gold, #e8b64a)",
            background: "rgba(232, 182, 74, 0.08)",
          }}
        >
          <div style={{ fontWeight: 800, color: "var(--color-gold, #e8b64a)" }}>
            🎉 You've been invited to Room {initialRoomId}
          </div>
          <div
            style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}
          >
            Enter your name below and tap Join Room to play.
          </div>
        </motion.div>
      )}

      {/* How to Play — placed above the action card so newcomers read the
          rules before they create/join. Auto-open on a first visit. */}
      <motion.div
        style={{ textAlign: "center", marginBottom: "1.25rem", width: "100%" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <button
          className="button-secondary"
          style={{
            background: "transparent",
            border: "1px solid var(--border-strong)",
            padding: "0.5rem 1.5rem",
            fontSize: "0.9rem",
          }}
          onClick={() => setShowHowToPlay((v) => !v)}
        >
          {showHowToPlay ? "Hide Rules ▲" : "New here? How to Play 📖"}
        </button>
      </motion.div>

      <AnimatePresence>
        {showHowToPlay && (
          <motion.div
            className="how-to-play-section"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: "2rem" }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            style={{ overflow: "hidden", width: "100%" }}
          >
            <h2 className="how-to-play-title">How to Play</h2>
            <div className="how-to-play-grid">
              {HOW_TO_PLAY.map((step, i) => (
                <motion.div
                  key={i}
                  className="how-to-play-card glass-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  whileHover={{ y: -4, boxShadow: `0 8px 30px -8px ${step.color}40` }}
                >
                  <div className="how-to-play-icon" style={{ color: step.color }}>
                    {step.emoji}
                  </div>
                  <div className="how-to-play-content">
                    <div className="how-to-play-card-title" style={{ color: step.color }}>
                      {step.title}
                    </div>
                    <div className="how-to-play-card-desc">{step.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Action Card */}
      <motion.div
        className="lobby-card glass-panel lobby-action-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.2 }}
      >
        <form onSubmit={handleNameSubmit} className="form-group">
          <label htmlFor="name-input">Your Name</label>
          <input
            id="name-input"
            type="text"
            className="input-field"
            placeholder="Enter your name (e.g. Chidi, Amina)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            maxLength={15}
            autoFocus={invited}
            required
          />
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <motion.button
            type="button"
            className="button-primary"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            {loading ? "Connecting..." : "Create New Room 🏠"}
          </motion.button>

          {onQuickMatch && (
            <motion.button
              type="button"
              className="button-primary"
              style={{
                background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                boxShadow: "0 2px 10px rgba(139, 92, 246, 0.25)",
              }}
              onClick={async () => {
                if (!name.trim()) return;
                setLoading(true);
                try {
                  await onQuickMatch(name.trim());
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || !name.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {loading ? "Searching..." : "Quick Match 🎲"}
            </motion.button>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.1)" }} />
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                fontWeight: "700",
                letterSpacing: "0.08em",
              }}
            >
              OR JOIN EXISTING
            </span>
            <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.1)" }} />
          </div>

          <form onSubmit={handleJoin} className="form-group">
            <label htmlFor="room-input">Room Code</label>
            <input
              id="room-input"
              type="text"
              className="input-field"
              placeholder="Enter Room Code (e.g. B8sD3)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={loading}
              maxLength={12}
            />
            <motion.button
              type="submit"
              className={invited ? "button-primary" : "button-secondary"}
              style={{ marginTop: "0.5rem" }}
              disabled={loading || !name.trim() || !roomId.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {loading ? "Joining..." : "Join Room 🚪"}
            </motion.button>
          </form>
        </div>
      </motion.div>

      {/* Player Stats */}
      {stats.gamesPlayed > 0 && (
        <motion.div
          style={{ marginTop: "1.5rem", width: "100%" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div
            className="glass-panel"
            style={{ padding: "1rem 1.5rem", border: "1px solid var(--border-subtle)" }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: "bold",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                marginBottom: "0.5rem",
                textAlign: "center",
              }}
            >
              📊 Your Stats
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.5rem",
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-gold)" }}>
                  {stats.gamesPlayed}
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Games</div>
              </div>
              <div>
                <div
                  style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-naira)" }}
                >
                  {stats.wins}
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Wins</div>
              </div>
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#3b82f6" }}>
                  {stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0}%
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Win Rate</div>
              </div>
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-gold)" }}>
                  ₦{(stats.bestNetWorth / 1000).toFixed(0)}k
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                  Best Net Worth
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Footer */}
      <motion.p
        style={{
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.75rem",
          marginTop: "2rem",
          paddingBottom: "2rem",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        2–6 players · No download required · Play in browser
      </motion.p>
    </div>
  );
}
