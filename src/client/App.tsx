import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Client } from "colyseus.js";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Lobby from "./components/Lobby";
import GameBoard from "./components/GameBoard";
import ControlPanel from "./components/ControlPanel";
import { BOARD } from "../data/board";
import { TOKENS, tokenEmoji } from "../data/tokens";
import * as sound from "./utils/sound";

// Fallback logic for local vs deployed addresses
const isDev = (import.meta as any).env.DEV;
const endpoint = isDev
  ? "ws://localhost:2567"
  : ((import.meta as any).env.VITE_SERVER_URL ?? window.location.origin.replace(/^http/, "ws"));

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
        name: response.name || "odogwu",
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
  const [muted, setMuted] = useState(sound.getMuted());
  const [showGameOverModal, setShowGameOverModal] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [selectedTilePos, setSelectedTilePos] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mySessionIdRef = useRef<string | null>(null);

  // Reset showGameOverModal when phase changes to game-over
  useEffect(() => {
    if (engineState?.phase === "game-over") {
      setShowGameOverModal(true);
    }
  }, [engineState?.phase]);

  // Auto-scrolling helper for the lobby chat
  useEffect(() => {
    const chatElement = document.getElementById("lobby-chat-box");
    if (chatElement) {
      chatElement.scrollTop = chatElement.scrollHeight;
    }
  }, [chatMessages]);

  const calculatePlayerNetWorth = (p: any, tiles: any) => {
    if (p.bankrupt) return 0;
    let netWorth = p.cash;
    Object.keys(tiles || {}).forEach((posStr) => {
      const pos = parseInt(posStr, 10);
      const ts = tiles[pos];
      if (ts.ownerId === p.id) {
        const tile = BOARD[pos];
        if ("price" in tile) {
          if (ts.mortgaged) {
            netWorth += tile.mortgage;
          } else {
            netWorth += tile.price;
            if (tile.type === "property" && ts.houses > 0) {
              netWorth += ts.houses * tile.houseCost;
            }
          }
        }
      }
    });
    return netWorth;
  };

  const getLeaderboard = () => {
    if (!engineState) return [];
    return [...engineState.players]
      .map((p) => {
        const netWorth = calculatePlayerNetWorth(p, engineState.tiles);
        const ownedTiles = BOARD.filter((t) => engineState.tiles[t.pos]?.ownerId === p.id);
        return {
          ...p,
          netWorth,
          assetsCount: ownedTiles.length,
        };
      })
      .sort((a, b) => b.netWorth - a.netWorth);
  };

  const resetGame = () => {
    if (room) {
      room.send("RESET_GAME");
    }
  };

  // Auto-scrolling helper for the log
  useEffect(() => {
    if (engineState) {
      const logsElement = document.getElementById("console-logs-box");
      if (logsElement) {
        logsElement.scrollTop = logsElement.scrollHeight;
      }
    }
  }, [engineState]);

  // Trigger sound effects + toast notifications based on new game log entries
  const [lastLogLength, setLastLogLength] = useState(0);
  useEffect(() => {
    if (engineState?.log && engineState.log.length > lastLogLength) {
      const newLogs = engineState.log.slice(lastLogLength);
      const mySessionId = mySessionIdRef.current;

      newLogs.forEach((logLine: string) => {
        if (logLine === "Game started.") {
          toast.success(" Game started! Let the hustle begin!", { toastId: "game-start", autoClose: 3000 });
          return;
        }

        // Sounds
        if (logLine.includes("rolled")) {
          sound.playRoll();
        } else if (logLine.includes("bought") || logLine.includes("passed START") || logLine.includes("collected the Bukka Pot")) {
          sound.playCash();
        } else if (logLine.includes("paid ₦") || logLine.includes("lost ₦") || logLine.includes("tax")) {
          sound.playRentPay();
        } else if (logLine.includes("drew Chance") || logLine.includes("drew Esusu")) {
          sound.playDraw();
        } else if (logLine.includes("Kirikiri Prison")) {
          sound.playJail();
        } else if (logLine.includes("built a")) {
          sound.playBuild();
        }

        // Toasts — only for events involving this player specifically
        if (mySessionId) {
          const myName = engineState.players?.find((p: any) => p.id === mySessionId)?.name;

          if (myName) {
            if (logLine.startsWith(myName)) {
              // My action toasts
              if (logLine.includes("bought")) {
                const propMatch = logLine.match(/bought (.+) for ₦([\.\d,]+)/);
                if (propMatch) {
                  toast.success(`🏘️ You bought ${propMatch[1]} for ₦${propMatch[2]}!`, { autoClose: 3500 });
                }
              } else if (logLine.includes("passed START")) {
                toast.info("✅ Passed GO — collected ₦200,000!", { autoClose: 3000 });
              } else if (logLine.includes("rolled doubles") || logLine.includes("gets another roll")) {
                toast.info("🎲 Doubles! Roll again!", { autoClose: 2000, toastId: "doubles" });
              } else if (logLine.includes("Kirikiri Prison")) {
                toast.warning("🚔 You've been sent to Kirikiri Prison!", { autoClose: 4000 });
              } else if (logLine.includes("drew Chance") || logLine.includes("drew Esusu")) {
                const cardMatch = logLine.match(/drew (?:Chance|Esusu): "(.+)"/);
                if (cardMatch) {
                  toast(` Card: "${cardMatch[1]}"`, { autoClose: 4500 });
                }
              } else if (logLine.includes("built a")) {
                toast.success("🏗️ Property upgraded!", { autoClose: 2500 });
              } else if (logLine.includes("collected the Bukka Pot")) {
                toast.success("🍲 You landed on the Bukka! Jackpot collected!", { autoClose: 4000 });
              } else if (logLine.includes("bankrupt")) {
                toast.error("💀 You've gone bankrupt. Game over for you.", { autoClose: 6000 });
              }
            } else {
              // Events caused by others that affect me
              if (logLine.includes(`to ${myName}`)) {
                if (logLine.includes("paid")) {
                  const rentMatch = logLine.match(/paid ₦([\.\d,]+) rent to/);
                  if (rentMatch) {
                    toast.success(`💸 You collected ₦${rentMatch[1]} rent!`, { autoClose: 3000 });
                  }
                }
              }
              // Notify when others go bankrupt
              if (logLine.includes("bankrupt")) {
                const nameMatch = logLine.match(/^(.+?) (?:has gone|is now) bankrupt/);
                if (nameMatch) {
                  toast(`💀 ${nameMatch[1]} has gone bankrupt!`, { autoClose: 4000 });
                }
              }
              // Game over
              if (logLine.includes("wins the game")) {
                const winnerMatch = logLine.match(/^(.+?) wins the game/);
                if (winnerMatch) {
                  if (winnerMatch[1] === myName) {
                    toast.success("🏆 YOU WIN! E no easy, but you rule Naija!", { autoClose: false, closeOnClick: false });
                  } else {
                    toast(`🏆 ${winnerMatch[1]} wins the game!`, { autoClose: 5000 });
                  }
                }
              }
            }
          }
        }
      });
      setLastLogLength(engineState.log.length);
    } else if (!engineState?.log) {
      setLastLogLength(0);
    }
  }, [engineState?.log, lastLogLength]);

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
        startingCash: state.startingCash,
        turnLimit: state.turnLimit,
        freeParkingJackpot: state.freeParkingJackpot,
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
      toast.error(`❌ ${message.message}`, { autoClose: 4000 });
    });

    joinedRoom.onMessage("CHAT_MESSAGE", (chatMsg: any) => {
      setChatMessages((prev) => [...prev, chatMsg]);
      // Nudge the recipient when a private message arrives from someone else.
      if (chatMsg.toId && chatMsg.senderId !== mySessionIdRef.current) {
        toast.info(`🔒 ${chatMsg.senderName} (private): ${chatMsg.text}`, { autoClose: 4000 });
      }
    });

    // Store session ID for toast targeting
    mySessionIdRef.current = joinedRoom.sessionId;
  };

  const showError = (msg: string) => {
    toast.error(`❌ ${msg}`, { autoClose: 4000 });
  };

  const createRoom = async (name: string) => {
    try {
      // Always spin up a fresh room with its own code. joinOrCreate would drop
      // the host into whatever existing room is still open for joining.
      const roomInstance = await colyseusClient.create("odogwu", { name });
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

  const updateSettings = (settings: { startingCash?: number; turnLimit?: number; freeParkingJackpot?: boolean }) => {
    if (room) {
      room.send("UPDATE_SETTINGS", settings);
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

  const leaveRoom = () => {
    if (room) {
      // Fire-and-forget: don't await the server close handshake so the UI
      // resets instantly. The server's onLeave handler still runs correctly.
      room.leave().catch(() => {});
      setRoom(null);
      setRoomState(null);
      setEngineState(null);
      setChatMessages([]);
      setSelectedTilePos(null);
      setLastLogLength(0);
    }
  };

  const sendChatMessage = (text: string, toId?: string) => {
    if (room && text.trim()) {
      room.send("SEND_CHAT", { text: text.trim(), toId });
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-text">Odogwu Empire</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button 
            className="mute-toggle-btn" 
            onClick={() => {
              const nextMute = !muted;
              setMuted(nextMute);
              sound.setMuted(nextMute);
            }}
            title={muted ? "Unmute sounds" : "Mute sounds"}
            style={{
              background: "var(--surface-2)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "1.1rem",
              transition: "all 0.2s ease",
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {room && (
            <>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Player: <strong style={{ color: "var(--color-naira)" }}>{playerName}</strong></span>
              <span className="room-badge">Room Code: {room.roomId}</span>
              <button className="button-secondary" style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }} onClick={leaveRoom}>
                Exit Room
              </button>
            </>
          )}
        </div>
      </header>

      <ToastContainer
        position="top-right"
        theme="dark"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        style={{ zIndex: 99999, top: "70px" }}
      />

      {/* Error Popup Notification */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            className="error-popup"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            ❌ {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Router */}
      <AnimatePresence mode="wait">
      {!room ? (
        <motion.div
          key="landing"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Lobby
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
          />
        </motion.div>
      ) : roomState?.status === "lobby" ? (
        <motion.div
          key="lobby"
          className="lobby-view"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="lobby-columns-container">
            <div className="lobby-card glass-panel">
              <h2 className="lobby-title">Room Lobby</h2>
              <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Share code <strong style={{ color: "#3b82f6" }}>{room.roomId}</strong> with friends to join.
              </p>
              
              <div className="form-group">
                <label>Select Your Token Piece:</label>
                <div className="token-grid">
                  {TOKENS.map((token) => {
                    const lobbyPlayer = roomState.lobbyPlayers.get(room.sessionId);
                    const isSelected = lobbyPlayer?.tokenId === token.id;
                    // Taken by someone else → can't be picked.
                    const takenByOther = Array.from(roomState.lobbyPlayers.entries()).some(
                      ([id, p]: any) => id !== room.sessionId && p.tokenId === token.id
                    );
                    return (
                      <div
                        key={token.id}
                        className={`token-option ${isSelected ? "selected" : ""} ${takenByOther ? "taken" : ""}`}
                        onClick={() => !takenByOther && selectToken(token.id)}
                        title={takenByOther ? "Already taken by another player" : token.name}
                        style={takenByOther ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                      >
                        <span className="token-emoji">{token.emoji}</span>
                        <span className="token-name">{token.name}</span>
                        {takenByOther && <span className="token-taken-tag">Taken</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Game Settings Customization */}
              <div className="form-group">
                <label>Game Rules & Settings:</label>
                {room.sessionId === roomState.hostId ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Starting Capital:</span>
                      <select
                        className="input-field"
                        style={{ padding: "0.3rem 0.5rem", fontSize: "0.85rem", background: "rgba(0,0,0,0.4)" }}
                        value={roomState.startingCash ?? 1500000}
                        onChange={(e) => updateSettings({ startingCash: Number(e.target.value) })}
                      >
                        <option value={1000000}>₦1,000,000</option>
                        <option value={1500000}>₦1,500,000</option>
                        <option value={2000000}>₦2,000,000</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Turn Limit:</span>
                      <select
                        className="input-field"
                        style={{ padding: "0.3rem 0.5rem", fontSize: "0.85rem", background: "rgba(0,0,0,0.4)" }}
                        value={roomState.turnLimit ?? 0}
                        onChange={(e) => updateSettings({ turnLimit: Number(e.target.value) })}
                      >
                        <option value={0}>Unlimited (Play to Bankruptcy)</option>
                        <option value={1}>1 Round (Lightning Match)</option>
                        <option value={5}>5 Rounds (Short Match)</option>
                        <option value={20}>20 Rounds</option>
                        <option value={30}>30 Rounds</option>
                        <option value={50}>50 Rounds</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                      <input
                        id="jackpot-toggle"
                        type="checkbox"
                        checked={roomState.freeParkingJackpot ?? false}
                        onChange={(e) => updateSettings({ freeParkingJackpot: e.target.checked })}
                        style={{ cursor: "pointer" }}
                      />
                      <label htmlFor="jackpot-toggle" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", cursor: "pointer", fontWeight: "normal", margin: 0 }}>
                        Enable Bukka Jackpot (Free Parking Pot)
                      </label>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--surface-2)", fontSize: "0.85rem" }}>
                    <div>💰 Starting Capital: <strong style={{ color: "var(--color-naira)" }}>₦{(roomState.startingCash ?? 1500000).toLocaleString()}</strong></div>
                    <div>⏳ Turn Limit: <strong>{(roomState.turnLimit ?? 0) === 0 ? "Unlimited" : `${roomState.turnLimit} Rounds`}</strong></div>
                    <div>🍲 Bukka Jackpot: <strong style={{ color: roomState.freeParkingJackpot ? "var(--color-naira)" : "var(--text-muted)" }}>{roomState.freeParkingJackpot ? "Enabled" : "Disabled"}</strong></div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Players in Lobby ({roomState.lobbyPlayers.size}):</label>
                <div className="lobby-players-list">
                  {Array.from(roomState.lobbyPlayers.entries()).map(([id, player]: any) => (
                    <div key={id} className="lobby-player-row">
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span>{tokenEmoji(player.tokenId)}</span>
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
                  {roomState.lobbyPlayers.size < 2 ? "Need at least 2 players" : "Start Game "}
                </button>
              ) : (
                <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
                  Waiting for host to start the game...
                </p>
              )}
            </div>

            {/* Lobby Chat Panel */}
            <div className="lobby-chat-panel glass-panel">
              <h3 className="lobby-chat-title">Room Chat</h3>
              <div className="lobby-chat-history" id="lobby-chat-box">
                {chatMessages.length === 0 ? (
                  <div className="chat-empty-msg">No messages yet. Say hello in the chat!</div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div key={idx} className="chat-msg-row">
                      <span className="chat-msg-sender">
                        {tokenEmoji(msg.tokenId)} {msg.senderName}:
                      </span>
                      <span className="chat-msg-text">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
              <form 
                className="lobby-chat-input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const input = form.elements.namedItem("chatText") as HTMLInputElement;
                  if (input && input.value.trim()) {
                    sendChatMessage(input.value);
                    input.value = "";
                  }
                }}
              >
                <input 
                  type="text" 
                  name="chatText" 
                  placeholder="Type message here..." 
                  className="input-field chat-input-box"
                  autoComplete="off"
                />
                <button type="submit" className="button-primary chat-send-btn">Send</button>
              </form>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Active game dashboard */
        <motion.div
          key="game"
          className="dashboard-view"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="board-panel">
            <GameBoard engineState={engineState} roomState={roomState} mySessionId={room.sessionId} onTileClick={setSelectedTilePos} />
          </div>
          <div className="side-panel">
            {/* Players status panel */}
            <div className="players-hud glass-panel">
              <h3 className="players-hud-title">Players status</h3>
              {engineState?.players.map((p: any, idx: number) => {
                const isCurrent = engineState.currentPlayerIndex === idx;
                const lobbyPlayer = roomState?.lobbyPlayers?.get(p.id);
                const playerToken = tokenEmoji(lobbyPlayer?.tokenId);
                const ownedTiles = BOARD.filter((tile: any) => {
                  const ts = engineState.tiles[tile.pos];
                  return ts && ts.ownerId === p.id;
                });
                return (
                  <motion.div
                    key={p.id}
                    className={`hud-player-card ${isCurrent ? "active" : ""} ${p.bankrupt ? "bankrupt" : ""}`}
                    animate={isCurrent ? {
                      boxShadow: [
                        "0 0 0px rgba(16,185,129,0)",
                        "0 0 18px rgba(16,185,129,0.55)",
                        "0 0 0px rgba(16,185,129,0)"
                      ],
                    } : { boxShadow: "none" }}
                    transition={isCurrent ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
                    layout
                  >
                    <div className="hud-player-name-wrapper">
                      <span style={{ fontSize: "1.2rem" }}>{playerToken}</span>
                      <span className="hud-player-name">{p.name} {p.id === room.sessionId && "(You)"}</span>
                      {p.inJail && <span style={{ background: "var(--color-danger)", color: "#000", fontSize: "0.65rem", padding: "1px 4px", borderRadius: "3px", fontWeight: "bold" }}>JAIL</span>}
                    </div>
                    <span className="hud-player-cash">
                      {p.bankrupt ? "Bankrupt" : `₦${p.cash.toLocaleString()}`}
                    </span>

                    {/* Hover Popover Asset Inspector */}
                    <div className="hud-player-popover glass-panel">
                      <div className="popover-title">Assets owned by {p.name}</div>
                      {ownedTiles.length > 0 ? (
                        <div className="popover-tiles-list">
                          {ownedTiles.map((tile: any) => {
                            const ts = engineState.tiles[tile.pos];
                            const isProp = tile.type === "property";
                            const devName = ts.houses === 5 ? "Hotel" : ts.houses === 4 ? "Mini-Estate" : ts.houses === 3 ? "Mansion" : ts.houses === 2 ? "Duplex" : ts.houses === 1 ? "Bungalow" : "";
                            
                            return (
                              <div key={tile.pos} className="popover-tile-item">
                                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                  {isProp && (
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: `var(--color-${tile.group})`, display: "inline-block" }} />
                                  )}
                                  <span className="popover-tile-name">{tile.name}</span>
                                </div>
                                <div style={{ display: "flex", gap: "4px", fontSize: "0.7rem", alignItems: "center" }}>
                                  {ts.houses > 0 && <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{devName}</span>}
                                  {ts.mortgaged && <span style={{ color: "var(--color-danger)", fontWeight: "bold" }}>🔒 Mortgaged</span>}
                                  {!ts.mortgaged && ts.houses === 0 && <span style={{ color: "var(--text-muted)" }}>Unimproved</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="popover-no-assets">No properties owned yet.</div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Action panel & Game Log console */}
            <ControlPanel
              room={room}
              engineState={engineState}
              onSendAction={sendAction}
              chatMessages={chatMessages}
              onSendChatMessage={sendChatMessage}
            />
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Game Over Leaderboard Overlay */}
      <AnimatePresence>
      {engineState?.phase === "game-over" && showGameOverModal && (
        <motion.div
          className="game-over-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="game-over-modal glass-panel"
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.1 }}
          >
            <motion.h2
              className="game-over-title"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >🏆 GAME OVER 🏆</motion.h2>
            <motion.div
              className="winner-announcement"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.45 }}
            >
              {(() => {
                const winner = engineState.players.find((p: any) => p.id === engineState.winnerId);
                return winner ? (
                  <>
                    <motion.span
                      className="winner-emoji"
                      animate={{ rotate: [0, -15, 15, -10, 10, 0], y: [0, -10, 0] }}
                      transition={{ delay: 0.7, duration: 1.0, ease: "easeInOut" }}
                    >👑</motion.span>
                    <div>
                      <span className="winner-name">{winner.name}</span>
                      {winner.id === room.sessionId ? " — You don hammer! " : " is the Odogwu! "}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "0.25rem" }}>
                      {winner.id === room.sessionId
                        ? "You buy the land. You become the Odogwu. E no easy!"
                        : `${winner.name} chop all your money. Better luck next time!`}
                    </div>
                  </>
                ) : (
                  "The game has ended!"
                );
              })()}
            </motion.div>
            
            <div className="leaderboard-container">
              <h3 style={{ margin: "0 0 1rem 0", color: "var(--color-gold)", textTransform: "uppercase", fontSize: "1rem", letterSpacing: "1px" }}>Final Leaderboard</h3>
              <div className="leaderboard-table">
                <div className="leaderboard-header">
                  <span>Rank</span>
                  <span>Player</span>
                  <span>Status</span>
                  <span>Cash</span>
                  <span>Assets</span>
                  <span>Net Worth</span>
                </div>
                {getLeaderboard().map((p, index) => {
                  const lobbyPlayer = roomState?.lobbyPlayers?.get(p.id);
                  const playerToken = tokenEmoji(lobbyPlayer?.tokenId);
                  return (
                    <motion.div
                      key={p.id}
                      className={`leaderboard-row ${p.id === engineState.winnerId ? "winner-row" : ""}`}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + index * 0.1, duration: 0.35, ease: "easeOut" }}
                    >
                      <span className="player-rank">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                      </span>
                      <span className="player-identity">
                        <span>{playerToken}</span>
                        <span style={{ fontWeight: 600 }}>{p.name} {p.id === room.sessionId && "(You)"}</span>
                      </span>
                      <span className={`player-status ${p.bankrupt ? "bankrupt" : "active"}`}>
                        {p.bankrupt ? "Bankrupt 💀" : "Solvent"}
                      </span>
                      <span className="player-cash">₦{p.cash.toLocaleString()}</span>
                      <span className="player-assets">{p.assetsCount} properties</span>
                      <span className="player-networth" style={{ color: index === 0 ? "var(--color-gold)" : "var(--color-naira)" }}>
                        ₦{p.netWorth.toLocaleString()}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="game-over-actions">
              <button className="button-secondary" onClick={() => setShowGameOverModal(false)}>
                👀 Inspect Board
              </button>
              
              {room?.sessionId === roomState?.hostId ? (
                <button className="button-primary" onClick={resetGame}>
                  🔄 Play Again (Lobby)
                </button>
              ) : (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Waiting for host to return to lobby...
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Quick toggle to show leaderboard modal again when inspecting */}
      {engineState?.phase === "game-over" && !showGameOverModal && (
        <button 
          className="button-primary show-leaderboard-btn animate-pulse"
          onClick={() => setShowGameOverModal(true)}
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 1000,
            boxShadow: "0 0 15px var(--color-gold)",
          }}
        >
          🏆 Show Leaderboard
        </button>
      )}
      {/* Title Deed Inspector Modal */}
      <AnimatePresence>
      {selectedTilePos !== null && (() => {
        const tile = BOARD[selectedTilePos];
        const ts = engineState?.tiles[selectedTilePos];
        const isProp = tile.type === "property";
        const isAirport = tile.type === "airport";
        const isUtility = tile.type === "utility";
        const isTax = tile.type === "tax";
        
        let ownerName = "Unowned";
        if (ts?.ownerId) {
          ownerName = engineState.players.find((p: any) => p.id === ts.ownerId)?.name || "Unknown";
        }
        
        return (
          <motion.div
            className="game-over-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelectedTilePos(null)}
          >
            <motion.div
              className="deed-card glass-panel"
              initial={{ scale: 0.88, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              {isProp && (
                <div className="deed-header" style={{ backgroundColor: `var(--color-${tile.group})` }}>
                  <div className="deed-title">TITLE DEED</div>
                  <div className="deed-name">{tile.name}</div>
                </div>
              )}
              {!isProp && (
                <div className="deed-header generic">
                  <div className="deed-title">{tile.type.toUpperCase()}</div>
                  <div className="deed-name">{tile.name}</div>
                </div>
              )}
              
              <div className="deed-body">
                {isProp && (
                  <div className="deed-rent-list">
                    <div className="deed-rent-row base-rent">
                      <span>Rent (Vacant Land)</span>
                      <span>₦{tile.rent[0].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row set-rent" style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontStyle: "italic", marginBottom: "0.25rem", border: "none" }}>
                      <span>If full color set is owned</span>
                      <span>₦{(tile.rent[0] * 2).toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row">
                      <span>🏡 With Bungalow</span>
                      <span>₦{tile.rent[1].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row">
                      <span>🏠 With Duplex</span>
                      <span>₦{tile.rent[2].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row">
                      <span>🏰 With Mansion</span>
                      <span>₦{tile.rent[3].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row">
                      <span>🏘️ With Mini-Estate</span>
                      <span>₦{tile.rent[4].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row highlight">
                      <span>🏨 With Hotel</span>
                      <span>₦{tile.rent[5].toLocaleString()}</span>
                    </div>
                    
                    <div className="deed-divider" />
                    
                    <div className="deed-cost-info">
                      <div>Cost of Bungalow: <strong>₦{tile.houseCost.toLocaleString()}</strong></div>
                      <div>Mortgage Value: <strong>₦{tile.mortgage.toLocaleString()}</strong></div>
                      <div>Unmortgage Cost: <strong>₦{Math.round(tile.mortgage * 1.1).toLocaleString()}</strong></div>
                    </div>
                  </div>
                )}
                
                {isAirport && (
                  <div className="deed-rent-list">
                    <div className="deed-rent-row">
                      <span>1 Airport owned</span>
                      <span>₦{tile.rent[0].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row">
                      <span>2 Airports owned</span>
                      <span>₦{tile.rent[1].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row">
                      <span>3 Airports owned</span>
                      <span>₦{tile.rent[2].toLocaleString()}</span>
                    </div>
                    <div className="deed-rent-row highlight">
                      <span>4 Airports owned</span>
                      <span>₦{tile.rent[3].toLocaleString()}</span>
                    </div>
                    
                    <div className="deed-divider" />
                    
                    <div className="deed-cost-info">
                      <div>Purchase Cost: <strong>₦{tile.price.toLocaleString()}</strong></div>
                      <div>Mortgage Value: <strong>₦{tile.mortgage.toLocaleString()}</strong></div>
                      <div>Unmortgage Cost: <strong>₦{Math.round(tile.mortgage * 1.1).toLocaleString()}</strong></div>
                    </div>
                  </div>
                )}
                
                {isUtility && (
                  <div className="deed-rent-list">
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: "1.4", margin: "0 0 1rem 0" }}>
                      If one Utility is owned, rent is <strong>4x</strong> the value shown on the dice.
                      <br />
                      If both Utilities are owned, rent is <strong>10x</strong> the value shown on the dice.
                    </p>
                    
                    <div className="deed-divider" />
                    
                    <div className="deed-cost-info">
                      <div>Purchase Cost: <strong>₦{tile.price.toLocaleString()}</strong></div>
                      <div>Mortgage Value: <strong>₦{tile.mortgage.toLocaleString()}</strong></div>
                      <div>Unmortgage Cost: <strong>₦{Math.round(tile.mortgage * 1.1).toLocaleString()}</strong></div>
                    </div>
                  </div>
                )}

                {isTax && (
                  <div style={{ padding: "0.5rem 0", fontSize: "0.9rem" }}>
                    <p>Government Levy or Luxury Tax tile.</p>
                    <p style={{ color: "var(--color-danger)", fontWeight: "bold", fontSize: "1.1rem" }}>
                      Levy Amount: ₦{tile.amount.toLocaleString()}
                    </p>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      When landing on this tile, pay the amount directly to the Bank (or Bukka Rest Stop Pot if enabled).
                    </p>
                  </div>
                )}

                {!isProp && !isAirport && !isUtility && !isTax && (
                  <div style={{ padding: "0.5rem 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                    {tile.type === "go" && "START Tile. Collect ₦200,000 salary when passing."}
                    {tile.type === "chance" && "Chance Tile. Draw a Chance card and follow instructions."}
                    {tile.type === "esusu" && "Esusu Tile. Draw an Esusu card and collect/pay communal funds."}
                    {tile.type === "jail" && "Kirikiri Prison (Jail). Just visiting, or serve jail time if arrested."}
                    {tile.type === "free" && "Bukka Rest Stop. Rest up! Collect Bukka Pot jackpot taxes if enabled."}
                    {tile.type === "gotojail" && "Arrest Warrant. Move directly to Kirikiri Prison. Do not pass START."}
                  </div>
                )}
                
                {ts && (
                  <div className="deed-status-box" style={{ background: "var(--surface-1)", padding: "0.5rem", borderRadius: "6px", fontSize: "0.8rem", marginTop: "0.75rem", border: "1px solid var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Owner Status:</span>
                      <strong style={{ color: ts.ownerId ? "var(--color-gold)" : "var(--text-muted)" }}>
                        {ownerName}
                      </strong>
                    </div>
                    {ts.ownerId && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                          <span>Mortgaged:</span>
                          <strong style={{ color: ts.mortgaged ? "var(--color-danger)" : "#10b981" }}>
                            {ts.mortgaged ? "Yes (Locked)" : "No"}
                          </strong>
                        </div>
                        {isProp && ts.houses > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                            <span>Improvements:</span>
                            <strong style={{ color: "var(--color-gold)" }}>
                              {ts.houses === 5 ? "Hotel 🏨" : ts.houses === 4 ? "Mini-Estate 🏘️" : ts.houses === 3 ? "Mansion 🏰" : ts.houses === 2 ? "Duplex 🏠" : "Bungalow 🏡"}
                            </strong>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              
              <div style={{ marginTop: "1.25rem", width: "100%" }}>
                <button className="button-secondary" style={{ width: "100%" }} onClick={() => setSelectedTilePos(null)}>
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}
      </AnimatePresence>
    </div>
  );
}
