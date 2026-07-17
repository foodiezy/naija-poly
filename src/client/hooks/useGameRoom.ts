import { useState, useRef, useCallback, useEffect } from "react";
import { Client, Room } from "colyseus.js";
import { toast } from "react-toastify";
import { GameState, Action } from "../../engine/types";
import { ChatMessage } from "../../shared/chat";
import { RoomState, RoomSettings } from "../../shared/room";

// Fallback logic for local vs deployed addresses
const isDev = import.meta.env.DEV;
const endpoint = import.meta.env.VITE_SERVER_URL
  ? import.meta.env.VITE_SERVER_URL
  : isDev
    ? "ws://localhost:2567"
    : window.location.origin.replace(/^http/, "ws");

// The 0.16.22 matchmaking seat-reservation response, minus the `room` field
// that the 0.17 server omits and we synthesize below.
interface SeatReservation {
  room?: unknown;
  name?: string;
  roomId?: string;
  processId?: string;
  publicAddress?: string;
}

// Compatibility patch for Colyseus 0.17 matchmaking response in 0.16.22 client.
// `consumeSeatReservation` is a private client internal, so reaching it needs a
// single cast; the wrapper itself is fully typed.
function patchClientForV017(client: Client) {
  const internals = client as unknown as {
    consumeSeatReservation: (
      response: SeatReservation,
      rootSchema: unknown,
      reuse: unknown,
    ) => unknown;
  };
  const originalConsume = internals.consumeSeatReservation.bind(client);
  internals.consumeSeatReservation = function (
    response: SeatReservation,
    rootSchema: unknown,
    reuseRoomInstance: unknown,
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

// Mirrors GameRoom.onLeave's `allowReconnection(client, 60)` on the server —
// the seat stays reserved for 60s after a drop, so the client must keep
// retrying across that whole window instead of giving up after a few
// seconds (which used to abandon reconnectable sessions early on brief
// wifi drops or backgrounded tabs).
const RECONNECT_WINDOW_MS = 60_000;
const RECONNECT_RETRY_DELAYS_MS = [0, 1000, 2000, 3000, 5000]; // then steady 5s cadence

// A reconnection attempt that the server answered with "that seat is gone"
// (room disposed, reservation expired, server restarted) will never succeed —
// retrying it just pins the user on a spinner for the full 60s window.
function isPermanentReconnectError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /not found|expired|invalid|no longer|disposed|reservation/i.test(msg);
}

async function reconnectWithRetry(token: string): Promise<Room> {
  const deadline = Date.now() + RECONNECT_WINDOW_MS;
  let attempt = 0;
  for (;;) {
    const delay = RECONNECT_RETRY_DELAYS_MS[attempt] ?? 5000;
    attempt++;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (Date.now() >= deadline) throw new Error("Reconnect window expired");
    try {
      return await colyseusClient.reconnect(token);
    } catch (e) {
      if (isPermanentReconnectError(e) || Date.now() >= deadline) throw e;
      // transient (network blip) — keep trying until the deadline
    }
  }
}

// Pull a human-readable message off an unknown thrown value.
function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function useGameRoom() {
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [engineState, setEngineState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reconnecting, setReconnecting] = useState(false);

  const mySessionIdRef = useRef<string | null>(null);
  const intentionalLeaveRef = useRef(false);
  // My own secret objective, delivered privately (it is redacted from the
  // broadcast state so opponents can't read it from devtools).
  const myObjectiveRef = useRef<GameState["players"][number]["secretObjective"] | null>(null);
  const objectiveRequestedRef = useRef(false);

  const showError = useCallback((msg: string) => {
    toast.error(`❌ ${msg}`, { autoClose: 4000 });
  }, []);

  // Drop every trace of the current room (used for room-closed and
  // failed-reconnect paths so the UI can't be left on a dead, frozen board).
  const clearRoomState = useCallback(() => {
    setRoom(null);
    setRoomState(null);
    setEngineState(null);
    setChatMessages([]);
    setReconnecting(false);
    myObjectiveRef.current = null;
    objectiveRequestedRef.current = false;
    sessionStorage.removeItem("odogwu-reconnection-token");
  }, []);

  const handleRoomJoined = useCallback(
    (joinedRoom: Room) => {
      setRoom(joinedRoom);
      setReconnecting(false);
      intentionalLeaveRef.current = false;
      objectiveRequestedRef.current = false;

      // Ask once for notification permission so "your turn" alerts can fire
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }

      joinedRoom.onStateChange((state: RoomState) => {
        setRoomState({
          status: state.status,
          lobbyPlayers: new Map(state.lobbyPlayers),
          hostId: state.hostId,
          gameStateJson: state.gameStateJson,
          startingCash: state.startingCash,
          turnLimit: state.turnLimit,
          freeParkingJackpot: state.freeParkingJackpot,
          chaosMode: state.chaosMode,
          secretObjectives: state.secretObjectives,
          turnTimerEnabled: state.turnTimerEnabled,
          turnTimeoutSecs: state.turnTimeoutSecs,
          turnDeadline: state.turnDeadline,
        });

        if (state.gameStateJson) {
          try {
            const parsed = JSON.parse(state.gameStateJson) as GameState;
            // Weave my privately-delivered objective back into my player so
            // components keep reading it off the engine state as before.
            const mine = parsed.players.find((p) => p.id === joinedRoom.sessionId);
            if (mine && !mine.secretObjective) {
              if (myObjectiveRef.current) {
                mine.secretObjective = myObjectiveRef.current;
              } else if (
                parsed.settings.secretObjectives &&
                !mine.bankrupt &&
                parsed.phase !== "game-over" &&
                !objectiveRequestedRef.current
              ) {
                // Fresh mount after a reconnect: the START_GAME push is long
                // gone, so ask for it once.
                objectiveRequestedRef.current = true;
                joinedRoom.send("REQUEST_OBJECTIVE");
              }
            }
            setEngineState(parsed);
          } catch (e) {
            console.error("Failed to parse GameState JSON", e);
          }
        } else {
          setEngineState(null);
          myObjectiveRef.current = null;
          objectiveRequestedRef.current = false;
        }
      });

      joinedRoom.onMessage("ERROR", (message: { message: string }) => {
        toast.error(`❌ ${message.message}`, { autoClose: 4000 });
      });

      joinedRoom.onMessage(
        "SECRET_OBJECTIVE",
        (msg: { objective: GameState["players"][number]["secretObjective"] }) => {
          myObjectiveRef.current = msg.objective ?? null;
          // Re-merge into the already-rendered state so the panel updates now.
          setEngineState((prev) => {
            if (!prev || !myObjectiveRef.current) return prev;
            const mine = prev.players.find((p) => p.id === joinedRoom.sessionId);
            if (!mine || mine.secretObjective) return prev;
            return {
              ...prev,
              players: prev.players.map((p) =>
                p.id === joinedRoom.sessionId
                  ? { ...p, secretObjective: myObjectiveRef.current! }
                  : p,
              ),
            };
          });
        },
      );

      joinedRoom.onMessage("CHAT_MESSAGE", (chatMsg: ChatMessage) => {
        setChatMessages((prev) => [...prev, chatMsg]);
        if (chatMsg.toId && chatMsg.senderId !== mySessionIdRef.current) {
          toast.info(`🔒 ${chatMsg.senderName} (private): ${chatMsg.text}`, { autoClose: 4000 });
        }
      });

      joinedRoom.onLeave(async (code: number) => {
        if (intentionalLeaveRef.current) return;
        // 1000/4000 mean the server ended the session on purpose (room
        // disposed, deploy restart): the seat is NOT reserved, so retrying
        // the token would only hang. Tear down instead of freezing the board.
        if (code === 1000 || code === 4000) {
          clearRoomState();
          toast.error("❌ The game room was closed by the server.", {
            autoClose: 6000,
            toastId: "room-closed",
          });
          return;
        }
        const token = joinedRoom.reconnectionToken;
        if (!token) return;
        setReconnecting(true);
        try {
          const rejoined = await reconnectWithRetry(token);
          handleRoomJoined(rejoined);
          toast.success("✅ Reconnected!", { autoClose: 2000, toastId: "reconnected" });
        } catch {
          clearRoomState();
          toast.error("❌ Lost connection to the game. Please rejoin.", { autoClose: 6000 });
        }
      });

      mySessionIdRef.current = joinedRoom.sessionId;
      if (joinedRoom.reconnectionToken) {
        sessionStorage.setItem("odogwu-reconnection-token", joinedRoom.reconnectionToken);
      }
    },
    [clearRoomState],
  );

  // Attempt to reconnect on page reload
  useEffect(() => {
    const token = sessionStorage.getItem("odogwu-reconnection-token");
    if (token) {
      setReconnecting(true);
      reconnectWithRetry(token)
        .then((rejoinedRoom) => {
          handleRoomJoined(rejoinedRoom);
          toast.success("✅ Restored game session!", {
            autoClose: 2000,
            toastId: "reconnected-mount",
          });
        })
        .catch(() => {
          setReconnecting(false);
          sessionStorage.removeItem("odogwu-reconnection-token");
        });
    }
  }, [handleRoomJoined]);

  const createRoom = async (name: string) => {
    try {
      const roomInstance = await colyseusClient.create("odogwu", { name });
      setPlayerName(name);
      handleRoomJoined(roomInstance);
    } catch (e) {
      console.error(e);
      showError(errText(e, "Failed to create game room"));
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
    } catch (e) {
      console.error(e);
      const msg = errText(e, `Failed to join room "${roomId}"`);
      showError(
        /don start|already started/i.test(msg)
          ? "This game don start already — ask your friend to create a new room."
          : msg,
      );
    }
  };

  const quickMatch = async (name: string) => {
    try {
      const roomInstance = await colyseusClient.joinOrCreate("odogwu", { name });
      setPlayerName(name);
      handleRoomJoined(roomInstance);
    } catch (e) {
      console.error(e);
      showError(errText(e, "Couldn't find a game — try creating a room"));
    }
  };

  const leaveRoom = () => {
    if (room) {
      intentionalLeaveRef.current = true;
      room.leave().catch(() => {});
      clearRoomState();
    }
  };

  const sendAction = (action: Action) => {
    if (room) room.send("ACTION", action);
  };

  const selectToken = (tokenId: string) => {
    if (room) room.send("SELECT_TOKEN", { tokenId });
  };

  const addAI = () => {
    if (room) room.send("ADD_AI");
  };

  const updateSettings = (settings: RoomSettings) => {
    if (room) room.send("UPDATE_SETTINGS", settings);
  };

  const startGame = () => {
    if (room) {
      try {
        room.send("START_GAME");
      } catch (e) {
        showError(errText(e, "Failed to start game"));
      }
    }
  };

  const sendChatMessage = (text: string, toId?: string) => {
    if (room && text.trim()) {
      room.send("SEND_CHAT", { text: text.trim(), toId });
    }
  };

  const resetGame = () => {
    if (room) room.send("RESET_GAME");
  };

  // ---- DEV-ONLY helpers (no-ops in production; the server ignores the dev
  // message unless NODE_ENV !== "production"). Used to playtest chaos panels. ----
  const devForceChaos = (cardId: string) => {
    if (room && isDev) room.send("DEV_FORCE_CHAOS", { cardId });
  };

  const devStartChaosGame = () => {
    if (!room || !isDev) return;
    // Turn chaos on, ensure at least 2 players (top up with a bot), then start.
    room.send("UPDATE_SETTINGS", { chaosMode: true });
    const count = roomState?.lobbyPlayers?.size ?? 1;
    for (let i = count; i < 2; i++) room.send("ADD_AI");
    room.send("START_GAME");
  };

  return {
    playerName,
    room,
    roomState,
    engineState,
    chatMessages,
    reconnecting,
    mySessionId: mySessionIdRef.current,
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
    devForceChaos,
    devStartChaosGame,
  };
}
