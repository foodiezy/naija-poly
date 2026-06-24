import { useState, useRef, useCallback } from "react";
import { Client, Room } from "colyseus.js";
import { toast } from "react-toastify";
import { GameState, Action } from "../../engine/types";
import { ChatMessage } from "../../shared/chat";

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

export function useGameRoom() {
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
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

    joinedRoom.onStateChange((state: any) => {
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
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await new Promise((r) => setTimeout(r, attempt === 0 ? 600 : 1200 * attempt));
          const rejoined = await colyseusClient.reconnect(token);
          handleRoomJoined(rejoined);
          toast.success("✅ Reconnected!", { autoClose: 2000, toastId: "reconnected" });
          return;
        } catch {
          // keep trying
        }
      }
      setReconnecting(false);
      toast.error("❌ Lost connection to the game. Please rejoin.", { autoClose: 6000 });
      setRoom(null);
      setRoomState(null);
      setEngineState(null);
    });

    mySessionIdRef.current = joinedRoom.sessionId;
  }, []);

  const createRoom = async (name: string) => {
    try {
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

  const quickMatch = async (name: string) => {
    try {
      const roomInstance = await colyseusClient.joinOrCreate("odogwu", { name });
      setPlayerName(name);
      handleRoomJoined(roomInstance);
    } catch (e: any) {
      console.error(e);
      showError(e.message || "Couldn't find a game — try creating a room");
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

  const updateSettings = (settings: any) => {
    if (room) room.send("UPDATE_SETTINGS", settings);
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
