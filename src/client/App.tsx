import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Components
import Lobby from "./components/Lobby";
import RoomLobbyView from "./components/RoomLobbyView";
import GameBoard from "./components/GameBoard";
import ChatPanel from "./components/ChatPanel";
import ControlPanel from "./components/ControlPanel";
import TileInspector from "./components/TileInspector";
import GameOverModal from "./components/GameOverModal";

// Hooks & Utilities
import { useGameRoom } from "./hooks/useGameRoom";
import { useSoundEffects } from "./hooks/useSoundEffects";
import { useAutoEndTurn } from "./hooks/useAutoEndTurn";
import * as sound from "./utils/sound";
import { recordGameResult } from "./utils/stats";
import { BOARD } from "../data/board";
import { Player } from "../engine/types";

export default function App() {
  const {
    playerName: _playerName,
    room,
    roomState,
    engineState,
    chatMessages,
    errorMsg,
    reconnecting,
    mySessionId,
    createRoom,
    joinRoom,
    quickMatch,
    leaveRoom,
    sendAction,
    selectToken,
    addAI,
    updateSettings,
    startGame,
    sendChatMessage,
    resetGame,
  } = useGameRoom();

  const [muted, setMuted] = useState(sound.getMuted());
  const [showGameOverModal, setShowGameOverModal] = useState(true);
  const [selectedTilePos, setSelectedTilePos] = useState<number | null>(null);
  const [autoEndTurn, setAutoEndTurn] = useState(true);
  const [gameResultRecorded, setGameResultRecorded] = useState(false);

  // Initialize sound effects
  useSoundEffects(engineState, mySessionId);

  // Initialize auto end turn
  useAutoEndTurn(engineState, room, mySessionId, autoEndTurn);

  // Reset showGameOverModal when phase changes to game-over
  useEffect(() => {
    if (engineState?.phase === "game-over") {
      setShowGameOverModal(true);
    }
  }, [engineState?.phase]);

  // Record stats on game-over (once)
  useEffect(() => {
    if (engineState?.phase === "game-over" && !gameResultRecorded && mySessionId) {
      const me = engineState.players?.find((p: Player) => p.id === mySessionId);
      if (me) {
        // Compute net worth
        let myNetWorth = me.cash;
        Object.keys(engineState.tiles || {}).forEach((posStr) => {
          const pos = parseInt(posStr, 10);
          const ts = engineState.tiles[pos];
          if (ts.ownerId === me.id) {
            const tile = BOARD[pos];
            if ("price" in tile) {
              if (ts.mortgaged) {
                myNetWorth += tile.mortgage;
              } else {
                myNetWorth += tile.price;
                if (tile.type === "property" && ts.houses > 0) {
                  myNetWorth += ts.houses * (tile as any).houseCost;
                }
              }
            }
          }
        });
        const won = engineState.winnerId === mySessionId;
        recordGameResult(won, myNetWorth);
        setGameResultRecorded(true);
        if (won) sound.playGameOver();
      }
    }
  }, [engineState?.phase, gameResultRecorded, mySessionId, engineState]);

  const copyRoomCode = useCallback(async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomId);
      toast.success("📋 Room code copied!", { autoClose: 1500, toastId: "copy" });
    } catch {
      const el = document.createElement("textarea");
      el.value = room.roomId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success("📋 Room code copied!", { autoClose: 1500, toastId: "copy" });
    }
  }, [room]);

  return (
    <div className="app-container">
      {/* Header — 3-section layout */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-container">
            <span className="logo-text">Odogwu Empire</span>
          </div>
        </div>

        <div className="header-center">
          <span className="header-tagline">Buy the land. Become the Odogwu.</span>
          <span className="header-badge">👥 2-6 players · Real-time · Free</span>
        </div>

        <div className="header-right">
          {room && (
            <>
              <span className="room-badge" onClick={copyRoomCode} title="Click to copy room code">
                Room: {room.roomId}
                <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>📋</span>
              </span>
              <button className="header-btn header-btn-gold" onClick={copyRoomCode}>
                Copy
              </button>
            </>
          )}
          <button
            className="header-btn header-btn-outline"
            onClick={() => {
              const nextMute = !muted;
              setMuted(nextMute);
              sound.setMuted(nextMute);
            }}
            title={muted ? "Unmute sounds" : "Mute sounds"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {room && (
            <button className="header-btn header-btn-outline" onClick={leaveRoom}>
              Exit
            </button>
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
            onQuickMatch={quickMatch}
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
          <RoomLobbyView
            room={room}
            roomState={roomState}
            onCopyRoomCode={copyRoomCode}
            onSelectToken={selectToken}
            onAddAI={addAI}
            onUpdateSettings={updateSettings}
            onStartGame={startGame}
            chatMessages={chatMessages}
            onSendChatMessage={sendChatMessage}
          />
        </motion.div>
      ) : engineState ? (
        <motion.div
          key="game"
          className="game-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {reconnecting && (
            <div className="reconnect-overlay">
              <div className="reconnect-spinner"></div>
              <h2>Connection Lost</h2>
              <p>Attempting to reconnect...</p>
            </div>
          )}

          {/* Left column: room chat */}
          <div className="game-col game-col-left">
            <ChatPanel
              room={room}
              engineState={engineState}
              chatMessages={chatMessages}
              onSendChatMessage={sendChatMessage}
            />
          </div>

          {/* Center: the board */}
          <div className="board-panel">
            <GameBoard
              engineState={engineState}
              roomState={roomState}
              mySessionId={mySessionId || undefined}
              onTileClick={(pos) => setSelectedTilePos(pos)}
              onEndTurn={() => sendAction({ type: "END_TURN" })}
            />
          </div>

          {/* Right column: redesigned sidebar */}
          <div className="game-col game-col-right">
            <ControlPanel
              room={room}
              engineState={engineState}
              onSendAction={sendAction}
              autoEndTurn={autoEndTurn}
              onToggleAutoEndTurn={() => setAutoEndTurn(!autoEndTurn)}
              turnDeadline={roomState?.turnDeadline}
              turnTimeoutSecs={roomState?.turnTimeoutSecs}
            />
          </div>

          <AnimatePresence>
            {selectedTilePos !== null && (
              <TileInspector
                tilePos={selectedTilePos}
                engineState={engineState}
                roomState={roomState}
                onClose={() => setSelectedTilePos(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {engineState.phase === "game-over" && showGameOverModal && (
              <GameOverModal
                engineState={engineState}
                roomState={roomState}
                mySessionId={mySessionId}
                onResetGame={() => {
                  setShowGameOverModal(false);
                  resetGame();
                }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      ) : null}
      </AnimatePresence>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-left">
          <span className="footer-logo">🏛️ Odogwu Empire</span>
          <span>How to Play</span>
          <span>Privacy</span>
        </div>
        <div className="footer-right">
          © 2026 Odogwu Games · Made with Lagos vibes.
        </div>
      </footer>
    </div>
  );
}
