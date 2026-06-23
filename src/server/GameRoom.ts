import { Schema, type, MapSchema } from "@colyseus/schema";
import { Room, Client } from "colyseus";
import { createGame, applyAction } from "../engine/engine";
import { getAIAction } from "../engine/ai";
import type { Action } from "../engine/types";
import { TOKEN_IDS, MAX_PLAYERS } from "../data/tokens";

// AI (computer) players use reserved session ids that no real client can have.
function isAIPlayer(id: string): boolean {
  return id.startsWith("ai_");
}

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
  @type("boolean") turnTimerEnabled: boolean = false;
  @type("number") turnTimeoutSecs: number = 120;
  @type("number") turnDeadline: number = 0; // epoch ms; 0 = no active timer
}

export class GameRoom extends Room<{ state: GameRoomState }> {
  // One distinct token per player, so the room can't exceed the token roster.
  maxClients = MAX_PLAYERS;

  // Server-owned countdown for the active auction (Colyseus clock timer).
  private auctionTimer: any = undefined;
  // Pending scheduled move for a computer player.
  private aiTimer: any = undefined;
  // Per-turn AFK timeout (optional, host-configured).
  private turnTimer: any = undefined;

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

    // (Re)arm the AFK turn timer for the new turn/phase.
    this.armTurnTimer(nextEngineState);
    // Hand control to a computer player if one is up next (or owes an auction bid).
    this.scheduleAIIfNeeded();
  }

  private clearTurnTimer() {
    if (this.turnTimer) {
      this.turnTimer.clear();
      this.turnTimer = undefined;
    }
  }

  // Arm a per-turn countdown for a human's turn (if the host enabled it). Not
  // armed during auctions (those self-resolve) or for AI players (self-paced).
  private armTurnTimer(state: any) {
    this.clearTurnTimer();
    this.state.turnDeadline = 0;
    if (!this.state.turnTimerEnabled) return;
    if (state.phase === "auction" || state.phase === "game-over") return;
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.bankrupt || isAIPlayer(current.id)) return;

    const secs = this.state.turnTimeoutSecs || 120;
    this.state.turnDeadline = Date.now() + secs * 1000;
    this.turnTimer = this.clock.setTimeout(() => this.onTurnTimeout(), secs * 1000);
  }

  // The active human ran out of time: make a safe, neutral move so play continues.
  private onTurnTimeout() {
    this.turnTimer = undefined;
    if (this.state.status !== "in_progress") return;
    let s: any;
    try {
      s = JSON.parse(this.state.gameStateJson);
    } catch {
      return;
    }
    if (s.phase === "auction" || s.phase === "game-over") return;
    const current = s.players[s.currentPlayerIndex];
    if (!current || current.bankrupt || isAIPlayer(current.id)) return;

    let action: Action | null = null;
    if (s.phase === "awaiting-roll") action = { type: "ROLL" };
    else if (s.phase === "awaiting-buy-decision") action = { type: "DECLINE_BUY" };
    else if (s.phase === "awaiting-end-turn") action = current.cash < 0 ? { type: "DECLARE_BANKRUPT" } : { type: "END_TURN" };
    if (!action) return;

    try {
      this.runEngineAction(current.id, action);
      this.broadcast("ERROR", { message: `${current.name} ran out of time — auto-played their turn.` });
    } catch (err: any) {
      console.error(`Turn timeout auto-move failed: ${err.message}`);
    }
  }

  private clearAITimer() {
    if (this.aiTimer) {
      this.aiTimer.clear();
      this.aiTimer = undefined;
    }
  }

  // If a computer player should act now, schedule its move after a short,
  // human-like delay. No-op when it's a human's turn or the game is over.
  private scheduleAIIfNeeded() {
    this.clearAITimer();
    if (this.state.status !== "in_progress") return;

    let engineState: any;
    try {
      engineState = JSON.parse(this.state.gameStateJson);
    } catch {
      return;
    }
    if (engineState.phase === "game-over") return;

    let actorId: string | null = null;
    if (engineState.phase === "auction" && engineState.auctionState) {
      const a = engineState.auctionState;
      actorId =
        a.participantIds.find(
          (id: string) => isAIPlayer(id) && !a.passedIds.includes(id) && a.highestBidderId !== id,
        ) ?? null;
    } else {
      const current = engineState.players[engineState.currentPlayerIndex];
      if (current && isAIPlayer(current.id) && !current.bankrupt) actorId = current.id;
    }
    if (!actorId) return;

    const delay = 800 + Math.floor(Math.random() * 900); // 0.8–1.7s, feels natural
    const id = actorId;
    this.aiTimer = this.clock.setTimeout(() => this.runAIAction(id), delay);
  }

  private runAIAction(actorId: string) {
    this.aiTimer = undefined;
    if (this.state.status !== "in_progress") return;

    let engineState: any;
    try {
      engineState = JSON.parse(this.state.gameStateJson);
    } catch {
      return;
    }

    const action = getAIAction(engineState, actorId);
    if (!action) {
      this.scheduleAIIfNeeded();
      return;
    }
    try {
      this.runEngineAction(actorId, action); // persists + reschedules the next AI move
    } catch (err: any) {
      console.error(`AI ${actorId} action failed: ${err.message}`);
      this.scheduleAIIfNeeded();
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
      this.armTurnTimer(nextEngineState);
      this.scheduleAIIfNeeded();
    } catch (err: any) {
      console.error(`Error resolving auction on timeout: ${err.message}`);
    }
  }

  onCreate(_options: any) {
    this.setState(new GameRoomState());

    // Message handler to select token
    this.onMessage("SELECT_TOKEN", (client, message: { tokenId: string }) => {
      // Never throw out of a message handler: an uncaught throw escapes the ws
      // receiver and crashes the whole server process. Report back to the
      // offending client and bail instead.
      if (this.state.status !== "lobby") {
        client.send("ERROR", { message: "Cannot select token once game starts" });
        return;
      }
      const player = this.state.lobbyPlayers.get(client.sessionId);
      if (!player) return;

      if (!TOKEN_IDS.includes(message.tokenId)) {
        client.send("ERROR", { message: "Unknown token" });
        return;
      }

      // No two players may hold the same token — pieces must be distinguishable
      // on the board and in owner badges.
      let takenByOther = false;
      this.state.lobbyPlayers.forEach((p, id) => {
        if (id !== client.sessionId && p.tokenId === message.tokenId) {
          takenByOther = true;
        }
      });
      if (takenByOther) {
        client.send("ERROR", { message: "That token is already taken" });
        return;
      }

      player.tokenId = message.tokenId;
      console.log(`Player ${player.name} selected token: ${message.tokenId}`);
    });

    // Message handler to update lobby settings
    this.onMessage("UPDATE_SETTINGS", (client, message: { startingCash?: number; turnLimit?: number; freeParkingJackpot?: boolean; turnTimerEnabled?: boolean; turnTimeoutSecs?: number }) => {
      if (this.state.status !== "lobby") {
        client.send("ERROR", { message: "Cannot change settings once game starts" });
        return;
      }
      if (client.sessionId !== this.state.hostId) {
        client.send("ERROR", { message: "Only the host can modify settings" });
        return;
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
      if (message.turnTimerEnabled !== undefined) {
        this.state.turnTimerEnabled = message.turnTimerEnabled;
      }
      if (message.turnTimeoutSecs !== undefined) {
        this.state.turnTimeoutSecs = message.turnTimeoutSecs;
      }
      console.log(`Lobby settings updated: startingCash=${this.state.startingCash}, turnLimit=${this.state.turnLimit}, jackpot=${this.state.freeParkingJackpot}, turnTimer=${this.state.turnTimerEnabled}/${this.state.turnTimeoutSecs}s`);
    });

    // Message handler to add a computer player (host only, lobby only).
    this.onMessage("ADD_AI", (client) => {
      if (this.state.status !== "lobby") {
        client.send("ERROR", { message: "Can only add AI players in the lobby" });
        return;
      }
      if (client.sessionId !== this.state.hostId) {
        client.send("ERROR", { message: "Only the host can add AI players" });
        return;
      }
      if (this.state.lobbyPlayers.size >= MAX_PLAYERS) {
        client.send("ERROR", { message: "Room is full" });
        return;
      }

      const taken = new Set<string>();
      this.state.lobbyPlayers.forEach((p) => taken.add(p.tokenId));
      const token = TOKEN_IDS.find((id) => !taken.has(id)) ?? TOKEN_IDS[0];

      let n = 1;
      while (this.state.lobbyPlayers.has(`ai_${n}`)) n++;
      const aiId = `ai_${n}`;

      const ai = new LobbyPlayer();
      ai.id = aiId;
      ai.name = `CPU ${n}`;
      ai.tokenId = token;
      this.state.lobbyPlayers.set(aiId, ai);
      console.log(`Host added computer player ${aiId} (${ai.name})`);
    });

    // Message handler to start game
    this.onMessage("START_GAME", (client, _message) => {
      if (this.state.status !== "lobby") {
        client.send("ERROR", { message: "Game is already in progress" });
        return;
      }
      if (client.sessionId !== this.state.hostId) {
        client.send("ERROR", { message: "Only the host can start the game" });
        return;
      }

      const playerIds = Array.from(this.state.lobbyPlayers.keys()) as string[];
      if (playerIds.length < 2) {
        client.send("ERROR", { message: "Must have at least 2 players to start" });
        return;
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
      // The first player up could be a computer; also start their turn clock.
      this.armTurnTimer(initialEngineState);
      this.scheduleAIIfNeeded();
    });

    // Message handler for player actions
    this.onMessage("ACTION", (client, action: Action) => {
      if (this.state.status !== "in_progress") {
        client.send("ERROR", { message: "Game is not in progress" });
        return;
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
        client.send("ERROR", { message: "Only the host can reset the game" });
        return;
      }
      this.clearAuctionTimer();
      this.clearTurnTimer();
      this.clearAITimer();
      this.state.turnDeadline = 0;
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
    // Default to the first token not already claimed, so joiners never collide.
    const taken = new Set<string>();
    this.state.lobbyPlayers.forEach((p) => taken.add(p.tokenId));
    player.tokenId = TOKEN_IDS.find((id) => !taken.has(id)) ?? TOKEN_IDS[0];

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
        // Player failed to reconnect in 60s (or left intentionally). Forfeit
        // them through the engine so turns keep flowing and the game can't
        // stall waiting on someone who is gone.
        console.log(`Client ${client.sessionId} permanently disconnected.`);
        if (this.state.status === "in_progress") {
          try {
            this.runEngineAction(client.sessionId, { type: "FORFEIT" });
            console.log(`Client ${client.sessionId} forfeited after disconnect.`);
          } catch (err: any) {
            console.error(`Error forfeiting disconnected player: ${err.message}`);
          }
        }
      }
    }
  }

  onDispose() {
    this.clearAuctionTimer();
    this.clearAITimer();
    this.clearTurnTimer();
    console.log(`Room ${this.roomId} disposed.`);
  }
}
