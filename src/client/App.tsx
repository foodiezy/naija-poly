import { useState, useEffect } from "react";
import { Client } from "colyseus.js";
import Lobby from "./components/Lobby";
import GameBoard from "./components/GameBoard";
import ControlPanel from "./components/ControlPanel";

// Fallback logic for local vs deployed addresses
const isDev = (import.meta as any).env.DEV;
const endpoint = isDev
  ? "ws://localhost:2567"
  : window.location.origin.replace(/^http/, "ws");

// Compatibility patch for Colyseus 0.17 matchmaking response in 0.16.22 client
function patchClientForV017(client: Client) {
  const originalConsume = (client as any).consumeSeatReservation.bind(client);
  (client as any).consumeSeatReservation = function (
    response: any,
    rootSchema: any,
    reuseRoomInstance: any
  ) {
    if (response && !response.room) {
      response.room = {
        name: response.name || "richup",
        roomId: response.roomId,
        processId: response.processId,
        publicAddress: response.publicAddress,
      };
    }
    return originalConsume(response, rootSchema, reuseRoomInstance);
  };
}

const colyseusClient = new Client(endpoint);
patchClientForV017(colyseusClient);

export default function App() {
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<any>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const [engineState, setEngineState] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-scrolling helper for the log
  useEffect(() => {
    if (engineState) {
      const logsElement = document.getElementById("console-logs-box");
      if (logsElement) {
        logsElement.scrollTop = logsElement.scrollHeight;
      }
    }
  }, [engineState]);

  const handleRoomJoined = (joinedRoom: any) => {
    setRoom(joinedRoom);
    setErrorMsg(null);

    // Listen for state changes
    joinedRoom.onStateChange((state: any) => {
      setRoomState({
        status: state.status,
        lobbyPlayers: new Map(state.lobbyPlayers),
        hostId: state.hostId,
        gameStateJson: state.gameStateJson,
      });

      if (state.gameStateJson) {
        try {
          const parsed = JSON.parse(state.gameStateJson);
          setEngineState(parsed);
        } catch (e) {
          console.error("Failed to parse GameState JSON", e);
        }
      } else {
        setEngineState(null);
      }
    });

    joinedRoom.onMessage("ERROR", (message: { message: string }) => {
      showError(message.message);
    });
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => {
      setErrorMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const createRoom = async (name: string) => {
    try {
      const roomInstance = await colyseusClient.joinOrCreate("richup", { name });
      setPlayerName(name);
      handleRoomJoined(roomInstance);
    } catch (e: any) {
      console.error(e);
      showError(e.message || "Failed to create game room");
    }
  };

  const joinRoom = async (name: string, roomId: string) => {
    if (!roomId.trim()) {
      showError("Please enter a room code");
      return;
    }
    try {
      const roomInstance = await colyseusClient.joinById(roomId.trim(), { name });
      setPlayerName(name);
      handleRoomJoined(roomInstance);
    } catch (e: any) {
      console.error(e);
      showError(e.message || `Failed to join room "${roomId}"`);
    }
  };

  const selectToken = (tokenId: string) => {
    if (room) {
      room.send("SELECT_TOKEN", { tokenId });
    }
  };

  const startGame = () => {
    if (room) {
      try {
        room.send("START_GAME");
      } catch (e: any) {
        showError(e.message);
      }
    }
  };

  const sendAction = (action: any) => {
    if (room) {
      room.send("ACTION", action);
    }
  };

  const leaveRoom = async () => {
    if (room) {
      await room.leave();
      setRoom(null);
      setRoomState(null);
      setEngineState(null);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-emoji">🇳🇬</span>
          <span className="logo-text">Naija Richup</span>
        </div>
        {room && (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Player: <strong style={{ color: "var(--color-naira)" }}>{playerName}</strong></span>
            <span className="room-badge">Room Code: {room.roomId}</span>
            <button className="button-secondary" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }} onClick={leaveRoom}>
              Exit Room
            </button>
          </div>
        )}
      </header>

      {/* Error Popup Notification */}
      {errorMsg && <div className="error-popup">❌ {errorMsg}</div>}

      {/* Content Router */}
      {!room ? (
        <Lobby
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
        />
      ) : roomState?.status === "lobby" ? (
        <div className="lobby-view">
          <div className="lobby-card glass-panel">
            <h2 className="lobby-title">Room Lobby</h2>
            <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Share code <strong style={{ color: "#3b82f6" }}>{room.roomId}</strong> with friends to join.
            </p>
            
            <div className="form-group">
              <label>Select Your Token Piece:</label>
              <div className="token-grid">
                {[
                  { id: "okada", emoji: "🏍️", name: "Okada" },
                  { id: "danfo_bus", emoji: "🚌", name: "Danfo" },
                  { id: "agbada", emoji: "🧥", name: "Agbada" },
                  { id: "eagle", emoji: "🦅", name: "Eagle" },
                ].map((token) => {
                  const lobbyPlayer = roomState.lobbyPlayers.get(room.sessionId);
                  const isSelected = lobbyPlayer?.tokenId === token.id;
                  return (
                    <div
                      key={token.id}
                      className={`token-option ${isSelected ? "selected" : ""}`}
                      onClick={() => selectToken(token.id)}
                    >
                      <span className="token-emoji">{token.emoji}</span>
                      <span className="token-name">{token.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Players in Lobby ({roomState.lobbyPlayers.size}):</label>
              <div className="lobby-players-list">
                {Array.from(roomState.lobbyPlayers.entries()).map(([id, player]: any) => (
                  <div key={id} className="lobby-player-row">
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>
                        {player.tokenId === "danfo_bus" ? "🚌" : player.tokenId === "okada" ? "🏍️" : player.tokenId === "agbada" ? "🧥" : "🦅"}
                      </span>
                      <span style={{ fontWeight: 600 }}>{player.name} {id === room.sessionId && "(You)"}</span>
                    </span>
                    {roomState.hostId === id && <span className="host-tag">HOST</span>}
                  </div>
                ))}
              </div>
            </div>

            {room.sessionId === roomState.hostId ? (
              <button
                className="button-primary"
                disabled={roomState.lobbyPlayers.size < 2}
                onClick={startGame}
              >
                {roomState.lobbyPlayers.size < 2 ? "Need at least 2 players" : "Start Game 🇳🇬"}
              </button>
            ) : (
              <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
                Waiting for host to start the game...
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Active game dashboard */
        <div className="dashboard-view">
          <div className="board-panel">
            <GameBoard engineState={engineState} roomState={roomState} />
          </div>
          <div className="side-panel">
            {/* Players status panel */}
            <div className="players-hud glass-panel">
              <h3 className="players-hud-title">Players status</h3>
              {engineState?.players.map((p: any, idx: number) => {
                const isCurrent = engineState.currentPlayerIndex === idx;
                const lobbyPlayer = roomState?.lobbyPlayers?.get(p.id);
                const tokenEmoji = lobbyPlayer?.tokenId === "danfo_bus" ? "🚌" : lobbyPlayer?.tokenId === "okada" ? "🏍️" : lobbyPlayer?.tokenId === "agbada" ? "🧥" : "🦅";
                return (
                  <div
                    key={p.id}
                    className={`hud-player-card ${isCurrent ? "active" : ""} ${p.bankrupt ? "bankrupt" : ""}`}
                  >
                    <div className="hud-player-name-wrapper">
                      <span style={{ fontSize: "1.2rem" }}>{tokenEmoji}</span>
                      <span className="hud-player-name">{p.name} {p.id === room.sessionId && "(You)"}</span>
                      {p.inJail && <span style={{ background: "var(--color-danger)", color: "#000", fontSize: "0.65rem", padding: "1px 4px", borderRadius: "3px", fontWeight: "bold" }}>JAIL</span>}
                    </div>
                    <span className="hud-player-cash">
                      {p.bankrupt ? "Bankrupt" : `₦${p.cash.toLocaleString()}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Action panel & Game Log console */}
            <ControlPanel
              room={room}
              engineState={engineState}
              onSendAction={sendAction}
            />
          </div>
        </div>
      )}
    </div>
  );
}
