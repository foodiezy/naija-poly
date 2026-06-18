import { Schema, type, MapSchema } from "@colyseus/schema";
import { Room, Client } from "colyseus";
import { createGame, applyAction } from "../engine/engine";
import type { Action } from "../engine/types";

export class LobbyPlayer extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") tokenId: string = ""; // okada, danfo_bus, agbada, etc.
}

export class GameRoomState extends Schema {
  @type("string") status: "lobby" | "in_progress" | "finished" = "lobby";
  @type({ map: LobbyPlayer }) lobbyPlayers = new MapSchema<LobbyPlayer>();
  @type("string") gameStateJson: string = "";
  @type("string") hostId: string = "";
  @type("number") startingCash: number = 1500000;
  @type("number") turnLimit: number = 0; // 0 = unlimited
  @type("boolean") freeParkingJackpot: boolean = false;
}

export class RichupRoom extends Room<{ state: GameRoomState }> {
  onCreate(_options: any) {
    this.setState(new GameRoomState());

    // Message handler to select token
    this.onMessage("SELECT_TOKEN", (client, message: { tokenId: string }) => {
      if (this.state.status !== "lobby") {
        throw new Error("Cannot select token once game starts");
      }
      const player = this.state.lobbyPlayers.get(client.sessionId);
      if (player) {
        player.tokenId = message.tokenId;
        console.log(`Player ${player.name} selected token: ${message.tokenId}`);
      }
    });

    // Message handler to update lobby settings
    this.onMessage("UPDATE_SETTINGS", (client, message: { startingCash?: number; turnLimit?: number; freeParkingJackpot?: boolean }) => {
      if (this.state.status !== "lobby") {
        throw new Error("Cannot change settings once game starts");
      }
      if (client.sessionId !== this.state.hostId) {
        throw new Error("Only the host can modify settings");
      }

      if (message.startingCash !== undefined) {
        this.state.startingCash = message.startingCash;
      }
      if (message.turnLimit !== undefined) {
        this.state.turnLimit = message.turnLimit;
      }
      if (message.freeParkingJackpot !== undefined) {
        this.state.freeParkingJackpot = message.freeParkingJackpot;
      }
      console.log(`Lobby settings updated: startingCash=${this.state.startingCash}, turnLimit=${this.state.turnLimit}, jackpot=${this.state.freeParkingJackpot}`);
    });

    // Message handler to start game
    this.onMessage("START_GAME", (client, _message) => {
      if (this.state.status !== "lobby") {
        throw new Error("Game is already in progress");
      }
      if (client.sessionId !== this.state.hostId) {
        throw new Error("Only the host can start the game");
      }

      const playerIds = Array.from(this.state.lobbyPlayers.keys()) as string[];
      if (playerIds.length < 2) {
        throw new Error("Must have at least 2 players to start");
      }

      // Initialize the pure game engine state with lobby settings
      const initialEngineState = createGame(playerIds, {
        startingCash: this.state.startingCash,
        turnLimit: this.state.turnLimit,
        freeParkingJackpot: this.state.freeParkingJackpot,
      });

      // Map custom lobby player display names back to engine players
      initialEngineState.players.forEach((p) => {
        const lobbyPlayer = this.state.lobbyPlayers.get(p.id);
        if (lobbyPlayer) {
          p.name = lobbyPlayer.name;
        }
      });

      this.state.gameStateJson = JSON.stringify(initialEngineState);
      this.state.status = "in_progress";

      console.log(`Game started with players: ${playerIds.join(", ")}`);
    });

    // Message handler for player actions
    this.onMessage("ACTION", (client, action: Action) => {
      if (this.state.status !== "in_progress") {
        throw new Error("Game is not in progress");
      }

      const engineState = JSON.parse(this.state.gameStateJson);

      try {
        const nextEngineState = applyAction(engineState, client.sessionId, action);
        this.state.gameStateJson = JSON.stringify(nextEngineState);

        // If the game is over, set room status
        if (nextEngineState.phase === "game-over") {
          this.state.status = "finished";
        }
      } catch (err: any) {
        // Send error back to client
        client.send("ERROR", { message: err.message });
        console.error(`Error applying action from client ${client.sessionId}: ${err.message}`);
      }
    });

    // Message handler to reset game back to lobby
    this.onMessage("RESET_GAME", (client, _message) => {
      if (client.sessionId !== this.state.hostId) {
        throw new Error("Only the host can reset the game");
      }
      this.state.status = "lobby";
      this.state.gameStateJson = "";
      console.log(`Game reset back to lobby by host ${client.sessionId}`);
    });

    // Message handler for in-game chat messages
    this.onMessage("SEND_CHAT", (client, message: { text: string }) => {
      const sender = this.state.lobbyPlayers.get(client.sessionId);
      const senderName = sender ? sender.name : "System";
      const tokenId = sender ? sender.tokenId : "";
      
      this.broadcast("CHAT_MESSAGE", {
        senderId: client.sessionId,
        senderName,
        tokenId,
        text: message.text,
        timestamp: Date.now()
      });
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const name = options.name || `Player_${client.sessionId.substring(0, 4)}`;

    const player = new LobbyPlayer();
    player.id = client.sessionId;
    player.name = name;
    // Default token to okada
    player.tokenId = "okada";

    this.state.lobbyPlayers.set(client.sessionId, player);

    // First player to join becomes the host
    if (this.state.lobbyPlayers.size === 1) {
      this.state.hostId = client.sessionId;
    }

    console.log(`Client ${client.sessionId} (Name: ${name}) joined room`);
  }

  async onLeave(client: Client, code?: number) {
    const consented = code === 1000 || code === 4000;
    console.log(`Client ${client.sessionId} left (code: ${code}, consented: ${consented})`);

    if (this.state.status === "lobby") {
      // If still in lobby, remove immediately
      this.state.lobbyPlayers.delete(client.sessionId);
      if (this.state.hostId === client.sessionId) {
        // Assign new host if any left
        const remainingKeys = Array.from(this.state.lobbyPlayers.keys()) as string[];
        this.state.hostId = remainingKeys.length > 0 ? remainingKeys[0] : "";
      }
    } else {
      // If game is in progress, allow 60 seconds to reconnect
      try {
        if (consented) {
          throw new Error("consented leave");
        }
        await this.allowReconnection(client, 60);
        console.log(`Client ${client.sessionId} successfully reconnected!`);
      } catch (e) {
        // Player failed to reconnect in 60s
        console.log(`Client ${client.sessionId} permanently disconnected.`);
      }
    }
  }

  onDispose() {
    console.log(`Room ${this.roomId} disposed.`);
  }
}
