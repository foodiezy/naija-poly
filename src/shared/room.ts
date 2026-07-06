// View-model shapes for the synced Colyseus room state, shared between the
// hook that decodes it and the components that render it. These mirror the
// server's GameRoomState schema fields the client actually reads.

export interface LobbyPlayerView {
  id: string;
  name: string;
  tokenId: string;
}

// Host-tunable room settings. Sent to the server via UPDATE_SETTINGS; each
// field is optional because the lobby patches them one at a time.
export interface RoomSettings {
  startingCash?: number;
  turnLimit?: number;
  freeParkingJackpot?: boolean;
  chaosMode?: boolean;
  secretObjectives?: boolean;
  turnTimerEnabled?: boolean;
  turnTimeoutSecs?: number;
}

// The decoded room state the client keeps in React state. `lobbyPlayers` is a
// plain Map here (rebuilt on each sync); the live `room.state.lobbyPlayers` is
// a Colyseus MapSchema, but both expose the get/entries/size/forEach the UI
// uses, so this type describes both.
export interface RoomState {
  status: "lobby" | "in_progress" | "finished";
  lobbyPlayers: Map<string, LobbyPlayerView>;
  hostId: string;
  gameStateJson: string;
  startingCash: number;
  turnLimit: number;
  freeParkingJackpot: boolean;
  chaosMode: boolean;
  secretObjectives: boolean;
  turnTimerEnabled: boolean;
  turnTimeoutSecs: number;
  turnDeadline: number;
}
