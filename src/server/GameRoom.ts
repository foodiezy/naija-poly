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

export class GameRoom extends Room<{ state: GameRoomState }> {
  // Server-owned countdown for the active auction (Colyseus clock timer).
  private auctionTimer: any = undefined;

  // Single path for mutating game state: apply the action through the pure
  // engine, (re)arm the auction timer if an auction is live, then persist.
  private runEngineAction(playerId: string, action: Action) {
    const engineState = JSON.parse(this.state.gameStateJson);
    const nextEngineState = applyAction(engineState, playerId, action);
    this.armAuctionTimer(nextEngineState);
    this.state.gameStateJson = JSON.stringify(nextEngineState);

    if (nextEngineState.phase === "game-over") {
      this.state.status = "finished";
    }
  }

  private clearAuctionTimer() {
    if (this.auctionTimer) {
      this.auctionTimer.clear();
      this.auctionTimer = undefined;
    }
  }

  // Stamp the bid deadline onto the broadcast state and schedule auto-resolve.
  // Called after every engine action: arms a fresh window while an auction is
  // live (each new bid nulls the deadline, so this resets the clock), and
  // clears the timer once the auction is over.
  private armAuctionTimer(state: any) {
    this.clearAuctionTimer();
    if (state.phase === "auction" && state.auctionState) {
      const duration = state.auctionState.bidDurationMs ?? 12000;
      state.auctionState.deadline = Date.now() + duration;
      this.auctionTimer = this.clock.setTimeout(() => this.onAuctionTimeout(), duration);
    }
  }

  private onAuctionTimeout() {
    this.auctionTimer = undefined;
    if (this.state.status !== "in_progress") return;
    try {
      const engineState = JSON.parse(this.state.gameStateJson);
      if (engineState.phase !== "auction") return;
      const nextEngineState = applyAction(engineState, "__server__", { type: "RESOLVE_AUCTION" });
      this.armAuctionTimer(nextEngineState);
      this.state.gameStateJson = JSON.stringify(nextEngineState);
      if (nextEngineState.phase === "game-over") {
        this.state.status = "finished";
      }
    } catch (err: any) {
      console.error(`Error resolving auction on timeout: ${err.message}`);
    }
  }

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

      // RESOLVE_AUCTION is a server-only timer event; clients must not fire it.
      if (action.type === "RESOLVE_AUCTION") {
        client.send("ERROR", { message: "Auctions resolve automatically when the timer runs out." });
        return;
      }

      try {
        this.runEngineAction(client.sessionId, action);
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
      this.clearAuctionTimer();
      this.state.status = "lobby";
      this.state.gameStateJson = "";
      console.log(`Game reset back to lobby by host ${client.sessionId}`);
    });

    // Message handler for chat messages. With `toId` set, the message is a
    // private/direct message delivered only to the sender and that recipient;
    // otherwise it is broadcast to everyone (the general channel).
    this.onMessage("SEND_CHAT", (client, message: { text: string; toId?: string }) => {
      const text = (message.text || "").trim();
      if (!text) return;

      const sender = this.state.lobbyPlayers.get(client.sessionId);
      const senderName = sender ? sender.name : "System";
      const tokenId = sender ? sender.tokenId : "";

      const payload: any = {
        senderId: client.sessionId,
        senderName,
        tokenId,
        text,
        timestamp: Date.now(),
        toId: message.toId ?? null,
      };

      if (message.toId) {
        // Private: send to the recipient (if connected) and echo to the sender.
        const recipient = this.state.lobbyPlayers.get(message.toId);
        payload.toName = recipient ? recipient.name : "Player";
        const recipientClient = this.clients.find((c) => c.sessionId === message.toId);
        if (recipientClient && recipientClient !== client) {
          recipientClient.send("CHAT_MESSAGE", payload);
        }
        client.send("CHAT_MESSAGE", payload);
      } else {
        this.broadcast("CHAT_MESSAGE", payload);
      }
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
    this.clearAuctionTimer();
    console.log(`Room ${this.roomId} disposed.`);
  }
}
