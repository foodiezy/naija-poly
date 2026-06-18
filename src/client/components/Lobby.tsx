import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LobbyProps {
  onCreateRoom: (name: string) => Promise<void>;
  onJoinRoom: (name: string, roomId: string) => Promise<void>;
}

const HOW_TO_PLAY = [
  {
    emoji: "💰",
    color: "#10b981",
    title: "Start with ₦1,500,000",
    desc: "Every player kicks off with a bag of Naira. Don't finish am!",
  },
  {
    emoji: "🎲",
    color: "#f59e0b",
    title: "Roll dice to move",
    desc: "Land on properties across Lagos, Abuja, and Port Harcourt. Roll doubles? You waka again!",
  },
  {
    emoji: "🏘️",
    color: "#3b82f6",
    title: "Buy and build",
    desc: "Purchase properties and build from Bungalow → Duplex → Mansion → Banana Tower!",
  },
  {
    emoji: "💸",
    color: "#ef4444",
    title: "Collect rent",
    desc: "When other players land on your property, dem must pay! Own a full color group to multiply rent.",
  },
  {
    emoji: "🤝",
    color: "#8b5cf6",
    title: "Trade and negotiate",
    desc: "Propose trade deals to other players. Cash, properties — anything goes.",
  },
  {
    emoji: "🏆",
    color: "#f59e0b",
    title: "Last man standing wins",
    desc: "Bankrupt all your opponents to become the Odogwu. E get level!",
  },
];

export default function Lobby({ onCreateRoom, onJoinRoom }: LobbyProps) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

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
          <span className="lobby-flag">🇳🇬</span>
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

      {/* Main Action Card */}
      <motion.div
        className="lobby-card glass-panel lobby-action-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.2 }}
      >
        <form onSubmit={handleCreate} className="form-group">
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

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.1)" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "700", letterSpacing: "0.08em" }}>OR JOIN EXISTING</span>
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
              className="button-secondary"
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

      {/* How to Play Toggle */}
      <motion.div
        style={{ textAlign: "center", marginTop: "2rem" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <button
          className="button-secondary"
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", padding: "0.5rem 1.5rem", fontSize: "0.9rem" }}
          onClick={() => setShowHowToPlay((v) => !v)}
        >
          {showHowToPlay ? "Hide Rules ▲" : "How to Play 📖"}
        </button>
      </motion.div>

      {/* How to Play Section */}
      <AnimatePresence>
        {showHowToPlay && (
          <motion.div
            className="how-to-play-section"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: "2rem" }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
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
                  <div className="how-to-play-icon" style={{ color: step.color }}>{step.emoji}</div>
                  <div className="how-to-play-content">
                    <div className="how-to-play-card-title" style={{ color: step.color }}>{step.title}</div>
                    <div className="how-to-play-card-desc">{step.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <motion.p
        style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "3rem", paddingBottom: "2rem" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        2–4 players · No download required · Play in browser
      </motion.p>
    </div>
  );
}
