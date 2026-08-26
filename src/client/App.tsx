import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Components
import LandingView from "./components/LandingView";
import JoinGate from "./components/JoinGate";
import RoomLobbyView from "./components/RoomLobbyView";
import GameBoard from "./components/GameBoard";
import GameShell from "./components/GameShell";
import GameFeed from "./components/GameFeed";
import ChatPanel from "./components/ChatPanel";
// (SettingsPanel removed in B5 — mute moved to the shell top bar and its
// overflow menu, where it is reachable without scrolling a sidebar.)
import ControlPanel from "./components/ControlPanel";
// (AssetsPanel removed — its holdings list duplicated ControlPanel's PropertyList;
// its unique Round + Net Worth now live in ControlPanel's player card.)
import TileInspector from "./components/TileInspector";
import GameOverModal from "./components/GameOverModal";
import BuyDeedModal from "./components/BuyDeedModal";
import AuctionPanel from "./components/AuctionPanel";
import ChaosDecisionPanel from "./components/ChaosDecisionPanel";
import OnboardingModal from "./components/OnboardingModal";
import DevPanel from "./components/DevPanel";
import TradeOverlay from "./components/TradeOverlay";
import TradeBuilder from "./components/TradeBuilder";
import DebtRescueModal from "./components/DebtRescueModal";
import { DecisionQueueProvider } from "./lib/decisionQueue";

// Hooks & Utilities
import { useGameRoom } from "./hooks/useGameRoom";
import { useSoundEffects } from "./hooks/useSoundEffects";
import { useAutoEndTurn } from "./hooks/useAutoEndTurn";
import { useTokenWalker } from "./hooks/useTokenWalker";
import * as sound from "./utils/sound";
import { recordGameResult } from "./utils/stats";
import { BOARD } from "../data/board";
import { Action, Player, TradeOffer } from "../engine/types";
import { playerInteractionState } from "./lib/gameInteractions";
import { hasSeenGameGuide, markGameGuideSeen } from "./lib/gameGuide";

const DICE_PRESENTATION_MS = 2050;

export default function App() {
  const {
    playerName: _playerName,
    room,
    roomState,
    engineState,
    chatMessages,
    reconnecting,
    mySessionId,
    createRoom,
    joinRoom,
    quickMatch,
    leaveRoom,
    sendAction: sendRoomAction,
    selectToken,
    addAI,
    updateSettings,
    startGame,
    sendChatMessage,
    resetGame,
    devForceChaos,
    devStartChaosGame,
  } = useGameRoom();

  const [muted, setMuted] = useState(sound.getMuted());
  const [showGameOverModal, setShowGameOverModal] = useState(true);
  const [selectedTilePos, setSelectedTilePos] = useState<number | null>(null);
  const [autoEndTurn, setAutoEndTurn] = useState(true);
  const [gameResultRecorded, setGameResultRecorded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tradeBuilderOpen, setTradeBuilderOpen] = useState(false);
  const [initialTradeOffer, setInitialTradeOffer] = useState<TradeOffer | undefined>();
  const [counterMode, setCounterMode] = useState(false);
  const [debtRescueOpen, setDebtRescueOpen] = useState(false);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const diceAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diceWasPresentRef = useRef(false);

  const startDiceAnimation = useCallback(() => {
    if (diceAnimationTimerRef.current) {
      clearTimeout(diceAnimationTimerRef.current);
    }

    setDiceAnimating(true);
    diceAnimationTimerRef.current = setTimeout(() => {
      setDiceAnimating(false);
      diceAnimationTimerRef.current = null;
    }, DICE_PRESENTATION_MS);
  }, []);

  const sendAction = useCallback(
    (action: Action) => {
      if (action.type === "ROLL") startDiceAnimation();
      sendRoomAction(action);
    },
    [sendRoomAction, startDiceAnimation],
  );

  const dicePresent = !!engineState?.dice;
  useEffect(() => {
    if (dicePresent && !diceWasPresentRef.current) {
      // Start again when the server result arrives. This keeps the decision
      // gate aligned with Dice's full two-second CodePen animation.
      startDiceAnimation();
    }
    diceWasPresentRef.current = dicePresent;
  }, [dicePresent, startDiceAnimation]);

  useEffect(
    () => () => {
      if (diceAnimationTimerRef.current) {
        clearTimeout(diceAnimationTimerRef.current);
      }
    },
    [],
  );

  // Room code from an invite link (?room=CODE), read once on load. While set,
  // the pre-room router shows ONLY the JoinGate sheet; "Start your own game"
  // clears it (and the URL param) to fall back to the landing screen.
  const [inviteRoomId, setInviteRoomId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("room")?.trim() ?? "";
  });

  const dismissInvite = useCallback(() => {
    setInviteRoomId("");
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Once we're in a room, strip ?room= from the address bar so a refresh
  // reconnects (via the stored token) instead of re-triggering the invite flow.
  useEffect(() => {
    if (room && typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [room]);

  // Own the token walker here (not in GameBoard) so the buy card can wait for
  // the player's piece to finish walking before it reveals the landing tile.
  const displayedPositions = useTokenWalker(engineState?.players ?? []);
  const myTokenWalking =
    !!mySessionId &&
    (() => {
      const me = engineState?.players?.find((p: Player) => p.id === mySessionId);
      if (!me) return false;
      const shown = displayedPositions.get(mySessionId);
      return shown !== undefined && shown !== me.position;
    })();
  const presentationBusy = myTokenWalking || diceAnimating;

  const {
    player: me,
    ledgerDebt: myLedgerDebt,
    inDebt,
    incomingTrade,
    canProposeTrade,
  } = playerInteractionState(engineState, mySessionId);

  const closeTradeBuilder = useCallback(() => {
    setTradeBuilderOpen(false);
    setInitialTradeOffer(undefined);
    setCounterMode(false);
  }, []);

  const openTradeBuilder = useCallback(() => {
    if (!engineState || !me || me.bankrupt || me.kicked) return;
    if (engineState.activeTrade) {
      toast.info("Finish the trade already on the table first.", { toastId: "trade-pending" });
      return;
    }
    if (!canProposeTrade) {
      toast.info("Trading is unavailable during this decision.", { toastId: "trade-blocked" });
      return;
    }
    setInitialTradeOffer(undefined);
    setCounterMode(false);
    setTradeBuilderOpen(true);
  }, [canProposeTrade, engineState, me]);

  // A normal offer composer belongs to the current turn. Counter-offers are
  // tied to the pending deal instead and can remain open across a turn change.
  useEffect(() => {
    if (!counterMode) closeTradeBuilder();
  }, [closeTradeBuilder, counterMode, engineState?.currentPlayerIndex]);

  useEffect(() => {
    if (counterMode && !engineState?.activeTrade) closeTradeBuilder();
  }, [counterMode, engineState?.activeTrade, closeTradeBuilder]);

  useEffect(() => {
    setDebtRescueOpen(inDebt);
  }, [inDebt]);

  // Give a first-time player the complete turn flow once, at the moment it
  // becomes relevant. Returning players go straight to the board, and the
  // guide remains available from the top bar at any time.
  useEffect(() => {
    if (roomState?.status !== "in_progress") return;
    if (hasSeenGameGuide()) return;
    setShowOnboarding(true);
  }, [roomState?.status]);

  // Preload any sample SFX files once (synth fallback covers missing files).
  useEffect(() => {
    sound.preloadSounds();
  }, []);

  // Initialize sound effects
  useSoundEffects(engineState, mySessionId);

  // Initialize auto end turn — suspended while a trade/debt composer or the
  // tile inspector is open, so the 2.5s timer can't discard what the player
  // is in the middle of doing.
  useAutoEndTurn(
    engineState,
    room,
    mySessionId,
    autoEndTurn &&
      !tradeBuilderOpen &&
      !debtRescueOpen &&
      selectedTilePos === null &&
      !diceAnimating,
  );

  // Reset showGameOverModal when phase changes to game-over; re-arm the
  // once-per-game stats latch whenever we're NOT at a game-over (so a rematch
  // in the same room records its result too).
  useEffect(() => {
    if (engineState?.phase === "game-over") {
      setShowGameOverModal(true);
    } else {
      setGameResultRecorded(false);
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
                  myNetWorth += ts.houses * tile.houseCost;
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
    // Share a tappable invite URL — one tap drops a friend straight into this
    // lobby with the code prefilled, instead of "copy code, open site, paste".
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("🔗 Invite link copied — share it!", { autoClose: 1800, toastId: "copy" });
    } catch {
      const el = document.createElement("textarea");
      el.value = inviteUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success("🔗 Invite link copied — share it!", { autoClose: 1800, toastId: "copy" });
    }
  }, [room]);

  // The in-game shell owns the whole viewport once play starts (spec §2): it
  // carries its own top bar, so the generic app header/footer would only be
  // stealing two bands from the board.
  const inGame = !!room && roomState?.status !== "lobby" && !!engineState;

  return (
    <div className="app-container">
      {/* Header — 3-section layout. Hidden before a room is joined: the v2
          landing / join screens carry their own identity (spec §2). */}
      {room && !inGame && (
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
                <span
                  className="room-badge"
                  onClick={copyRoomCode}
                  title="Click to copy the invite link"
                >
                  Room: {room.roomId}
                  <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>🔗</span>
                </span>
                <button className="header-btn header-btn-gold" onClick={copyRoomCode}>
                  Invite 🔗
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
      )}

      <ToastContainer
        position="top-right"
        theme="light"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        style={{ zIndex: 99999, top: "70px" }}
      />

      {/* Content Router.
          Deliberately NOT wrapped in AnimatePresence: a mode="wait" page
          transition here can strand the app if an exit animation never
          resolves — the view stays mounted at opacity 0 and the joined room
          never renders, leaving a blank screen with no way back. View-level
          fades are CSS (.view-fade); AnimatePresence is for modals only. */}
      <>
        {!room ? (
          <div className="view-fade">
            {reconnecting ? (
              <div
                className="reconnect-overlay"
                style={{
                  position: "relative",
                  minHeight: "60vh",
                  background: "transparent",
                  backdropFilter: "none",
                }}
              >
                <div className="reconnect-spinner"></div>
                <h2 style={{ marginTop: "1rem" }}>Welcome Back</h2>
                <p>Restoring your session...</p>
              </div>
            ) : inviteRoomId ? (
              // Invite-link clicker: ONLY the join sheet — no landing hero,
              // no rules, no create/quick-match (spec §1, "Invite-link → <15s").
              <JoinGate roomCode={inviteRoomId} onJoin={joinRoom} onStartOwn={dismissInvite} />
            ) : (
              <LandingView
                onCreateRoom={createRoom}
                onJoinRoom={joinRoom}
                onQuickMatch={quickMatch}
              />
            )}
          </div>
        ) : roomState?.status === "lobby" ? (
          <div className="lobby-view view-fade">
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
              onLeave={leaveRoom}
            />
          </div>
        ) : engineState ? (
          // The queue spans the whole game view so every forced decision is
          // reachable even when the mobile actions sheet is closed. Only one
          // decision gets the screen at a time (spec §2).
          <DecisionQueueProvider suspended={engineState.phase === "game-over"}>
            <GameShell
              engineState={engineState}
              roomState={roomState}
              mySessionId={mySessionId ?? ""}
              roomId={room.roomId}
              muted={muted}
              myTokenWalking={presentationBusy}
              interactionOverlayOpen={tradeBuilderOpen || debtRescueOpen || !!incomingTrade}
              chatMessageCount={chatMessages.length}
              onToggleMute={() => {
                const nextMute = !muted;
                setMuted(nextMute);
                sound.setMuted(nextMute);
              }}
              onCopyRoomCode={copyRoomCode}
              onLeave={leaveRoom}
              onHowToPlay={() => setShowOnboarding(true)}
              onSendAction={sendAction}
              onOpenTrade={openTradeBuilder}
              onOpenDebtRescue={() => setDebtRescueOpen(true)}
              onShowResults={() => setShowGameOverModal(true)}
              board={
                <GameBoard
                  engineState={engineState}
                  roomState={roomState}
                  mySessionId={mySessionId || undefined}
                  onTileClick={(pos) => setSelectedTilePos(pos)}
                  displayedPositions={displayedPositions}
                />
              }
              sidebar={
                <ControlPanel
                  room={room}
                  engineState={engineState}
                  onSendAction={sendAction}
                  autoEndTurn={autoEndTurn}
                  onToggleAutoEndTurn={() => setAutoEndTurn(!autoEndTurn)}
                  turnDeadline={roomState?.turnDeadline}
                  turnTimeoutSecs={roomState?.turnTimeoutSecs}
                  onOpenTile={(pos) => setSelectedTilePos(pos)}
                  onOpenTrade={openTradeBuilder}
                  onOpenDebtRescue={() => setDebtRescueOpen(true)}
                  myTokenWalking={presentationBusy}
                />
              }
              chat={
                <ChatPanel
                  room={room}
                  engineState={engineState}
                  chatMessages={chatMessages}
                  onSendChatMessage={sendChatMessage}
                />
              }
              feed={<GameFeed engineState={engineState} />}
              overlays={
                <>
                  {/* These decisions live at the game layer, not inside the
                      optional mobile actions sheet. Incoming deals and debt
                      rescue therefore surface immediately on every viewport. */}
                  {incomingTrade && !tradeBuilderOpen && (
                    <TradeOverlay
                      activeTrade={incomingTrade}
                      players={engineState.players}
                      tiles={engineState.tiles}
                      mySessionId={mySessionId ?? ""}
                      onSendAction={sendAction}
                      liveState={roomState ?? undefined}
                      onCounterOffer={(reversedTrade) => {
                        setInitialTradeOffer(reversedTrade);
                        setCounterMode(true);
                        setTradeBuilderOpen(true);
                      }}
                    />
                  )}

                  {debtRescueOpen && me && (
                    <DebtRescueModal
                      engineState={engineState}
                      me={me}
                      ledgerDebt={myLedgerDebt}
                      onSendAction={sendAction}
                      onClose={() => setDebtRescueOpen(false)}
                      onOpenTrade={openTradeBuilder}
                    />
                  )}

                  <AnimatePresence>
                    {tradeBuilderOpen && mySessionId && (
                      <TradeBuilder
                        key="trade-builder"
                        engineState={engineState}
                        mySessionId={mySessionId}
                        onSendAction={sendAction}
                        onClose={closeTradeBuilder}
                        liveState={roomState ?? undefined}
                        initialOffer={initialTradeOffer}
                        counterMode={counterMode}
                      />
                    )}
                  </AnimatePresence>

                  {reconnecting && (
                    <div className="reconnect-overlay">
                      <div className="reconnect-spinner"></div>
                      <h2>Connection Lost</h2>
                      <p>Attempting to reconnect...</p>
                    </div>
                  )}

                  <AnimatePresence>
                    {selectedTilePos !== null && (
                      <TileInspector
                        tilePos={selectedTilePos}
                        engineState={engineState}
                        roomState={roomState}
                        onClose={() => setSelectedTilePos(null)}
                        mySessionId={mySessionId}
                        canManage={
                          engineState.players?.[engineState.currentPlayerIndex]?.id ===
                            mySessionId &&
                          (engineState.phase === "awaiting-roll" ||
                            engineState.phase === "awaiting-end-turn")
                        }
                        onSendAction={sendAction}
                      />
                    )}
                  </AnimatePresence>

                  {/* Decision sheets (spec §2 L2). The auction and the chaos
                    decisions were promoted out of ControlPanel in step B4a:
                    that sidebar drops below the board under 980px, so these
                    two timed decisions were rendering off-screen on phones. */}
                  {mySessionId && !presentationBusy && (
                    <BuyDeedModal
                      engineState={engineState}
                      mySessionId={mySessionId}
                      onSendAction={sendAction}
                    />
                  )}

                  {mySessionId &&
                    !diceAnimating &&
                    engineState.phase === "auction" &&
                    engineState.auctionState && (
                      <AuctionPanel
                        auction={engineState.auctionState}
                        players={engineState.players}
                        mySessionId={mySessionId}
                        myCash={
                          engineState.players?.find((p: Player) => p.id === mySessionId)?.cash ?? 0
                        }
                        onSendAction={sendAction}
                      />
                    )}

                  {mySessionId && !diceAnimating && (
                    <ChaosDecisionPanel
                      engineState={engineState}
                      mySessionId={mySessionId}
                      onSendAction={sendAction}
                    />
                  )}

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
                        onClose={() => setShowGameOverModal(false)}
                      />
                    )}
                  </AnimatePresence>
                  {/* Dismissed the results to look at the board? The action
                    bar's primary becomes "See who be Odogwu" — no floating
                    button needed any more. */}
                </>
              }
            />
          </DecisionQueueProvider>
        ) : null}
      </>

      {/* Footer */}
      {/* Tutorial — top level so the footer "How to Play" works everywhere,
          not just on the landing page. */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            onClose={() => {
              setShowOnboarding(false);
              markGameGuideSeen();
            }}
          />
        )}
      </AnimatePresence>

      {/* Footer chrome — hidden pre-room like the header, and in game, where
          the shell's five bands leave no room for it (spec §2). */}
      {room && !inGame && (
        <footer className="app-footer">
          <div className="footer-left">
            <span className="footer-logo">🏛️ Odogwu Empire</span>
            <span
              style={{
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
              onClick={() => setShowOnboarding(true)}
            >
              How to Play
            </span>
          </div>
          <div className="footer-right">© 2026 Odogwu Games · Made with Lagos vibes.</div>
        </footer>
      )}

      {/* DEV-ONLY playtesting controls — tree-shaken out of production builds. */}
      {import.meta.env.DEV && room && (
        <DevPanel
          status={roomState?.status ?? "lobby"}
          onStartChaosGame={devStartChaosGame}
          onForceChaos={devForceChaos}
        />
      )}
    </div>
  );
}
