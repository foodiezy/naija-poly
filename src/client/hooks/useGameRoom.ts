import { useState, useRef, useCallback, useEffect } from "react";
import { Client, Room } from "colyseus.js";
import { toast } from "react-toastify";
import { GameState, Action } from "../../engine/types";
import { ChatMessage } from "../../shared/chat";
import { RoomState, RoomSettings } from "../../shared/room";

// Fallback logic for local vs deployed addresses
const isDev = import.meta.env.DEV;
const endpoint = isDev
  ? "ws://localhost:2567"
  : (import.meta.env.VITE_SERVER_URL ?? window.location.origin.replace(/^http/, "ws"));

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
    consumeSeatReservation: (response: SeatReservation, rootSchema: unknown, reuse: unknown) => unknown;
  };
  const originalConsume = internals.consumeSeatReservation.bind(client);
  internals.consumeSeatReservation = function (
    response: SeatReservation,
    rootSchema: unknown,
    reuseRoomInstance: unknown
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
      if (Date.now() >= deadline) throw e;
      // keep trying until the deadline
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const mySessionIdRef = useRef<string | null>(null);
  const intentionalLeaveRef = useRef(false);

  const showError = useCallback((msg: string) => {
    toast.error(`❌ ${msg}`, { autoClose: 4000 });
  }, []);

  const handleRoomJoined = useCallback((joinedRoom: Room) => {
    setRoom(joinedRoom);
    setErrorMsg(null);
    setReconnecting(false);
    intentionalLeaveRef.current = false;

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
        turnTimerEnabled: state.turnTimerEnabled,
        turnTimeoutSecs: state.turnTimeoutSecs,
        turnDeadline: state.turnDeadline,
      });

      if (state.gameStateJson) {
        try {
          const parsed = JSON.parse(state.gameStateJson) as GameState;
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

    joinedRoom.onMessage("CHAT_MESSAGE", (chatMsg: ChatMessage) => {
      setChatMessages((prev) => [...prev, chatMsg]);
      if (chatMsg.toId && chatMsg.senderId !== mySessionIdRef.current) {
        toast.info(`🔒 ${chatMsg.senderName} (private): ${chatMsg.text}`, { autoClose: 4000 });
      }
    });

    joinedRoom.onLeave(async (code: number) => {
      if (intentionalLeaveRef.current || code === 1000 || code === 4000) return;
      const token = joinedRoom.reconnectionToken;
      if (!token) return;
      setReconnecting(true);
      try {
        const rejoined = await reconnectWithRetry(token);
        handleRoomJoined(rejoined);
        toast.success("✅ Reconnected!", { autoClose: 2000, toastId: "reconnected" });
      } catch {
        setReconnecting(false);
        toast.error("❌ Lost connection to the game. Please rejoin.", { autoClose: 6000 });
        setRoom(null);
        setRoomState(null);
        setEngineState(null);
        sessionStorage.removeItem("odogwu-reconnection-token");
      }
    });

    mySessionIdRef.current = joinedRoom.sessionId;
    if (joinedRoom.reconnectionToken) {
      sessionStorage.setItem("odogwu-reconnection-token", joinedRoom.reconnectionToken);
    }
  }, []);

  // Attempt to reconnect on page reload
  useEffect(() => {
    const token = sessionStorage.getItem("odogwu-reconnection-token");
    if (token) {
      setReconnecting(true);
      reconnectWithRetry(token).then((rejoinedRoom) => {
        handleRoomJoined(rejoinedRoom);
        toast.success("✅ Restored game session!", { autoClose: 2000, toastId: "reconnected-mount" });
      }).catch(() => {
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
      showError(errText(e, `Failed to join room "${roomId}"`));
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
      setRoom(null);
      setRoomState(null);
      setEngineState(null);
      setChatMessages([]);
      sessionStorage.removeItem("odogwu-reconnection-token");
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

  return {
    playerName,
    room,
    roomState,
    engineState,
    chatMessages,
    errorMsg,
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
  };
}
