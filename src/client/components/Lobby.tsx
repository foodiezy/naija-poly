import React, { useState } from "react";

interface LobbyProps {
  onCreateRoom: (name: string) => Promise<void>;
  onJoinRoom: (name: string, roomId: string) => Promise<void>;
}

export default function Lobby({ onCreateRoom, onJoinRoom }: LobbyProps) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="lobby-view">
      <div className="lobby-card glass-panel">
        <h2 className="lobby-title">Naija Richup</h2>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Buy properties, build duplexes, pay rent in Naira, and bankrupt your friends! 🇳🇬
        </p>

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
          <button
            type="button"
            className="button-primary"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? "Connecting..." : "Create New Room 🏠"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <hr style={{ flex: 1, border: "0.5px solid rgba(255, 255, 255, 0.1)" }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>OR JOIN EXISTING</span>
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
            <button
              type="submit"
              className="button-secondary"
              style={{ marginTop: "0.5rem" }}
              disabled={loading || !name.trim() || !roomId.trim()}
            >
              {loading ? "Joining..." : "Join Room 🚪"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
