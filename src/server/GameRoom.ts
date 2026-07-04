import { Schema, type, MapSchema } from "@colyseus/schema";
import { Room, Client } from "colyseus";
import { createGame, applyAction } from "../engine/engine";
import { getAIAction } from "../engine/ai";
import type { Action, GameState } from "../engine/types";
import { TOKEN_IDS, MAX_PLAYERS } from "../data/tokens";
import type { ChatMessage } from "../shared/chat";

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
  @type("boolean") chaosMode: boolean = false; // NEPA blackout & other chaos cards
  @type("boolean") secretObjectives: boolean = false; // Hidden objectives for bonuses
  @type("boolean") turnTimerEnabled: boolean = false;
  @type("number") turnTimeoutSecs: number = 120;
  @type("number") turnDeadline: number = 0; // epoch ms; 0 = no active timer
}

export class GameRoom extends Room<GameRoomState> {
  // One distinct token per player, so the room can't exceed the token roster.
  maxClients = MAX_PLAYERS;

  // Server-owned countdown for the active auction (Colyseus clock timer).
  private auctionTimer?: ReturnType<typeof this.clock.setTimeout>;
  // Pending scheduled move for a computer player.
  private aiTimer?: ReturnType<typeof this.clock.setTimeout>;
  // Per-turn AFK timeout (optional, host-configured).
  private turnTimer?: ReturnType<typeof this.clock.setTimeout>;

  // Authoritative full engine state, kept in-memory only. The copy synced to
  // clients (this.state.gameStateJson) is REDACTED — it omits the shuffled
  // card decks so a player can't read upcoming Chance/Hustle cards from
  // devtools. All server logic reads this field, never the redacted JSON.
  private fullState: GameState | null = null;

  // Per-client token bucket, throttling inbound messages so a malicious client
  // can't flood ACTION/SEND_CHAT (each ACTION costs a structuredClone +
  // stringify of the whole game state). Capacity allows a natural burst; refill
  // is generous enough that real play never trips it.
  private rateBuckets = new Map<string, { tokens: number; last: number }>();
  private static readonly RL_CAPACITY = 20; // max burst
  private static readonly RL_REFILL_PER_SEC = 8; // sustained rate

  // Returns true if the client may send now (and spends a token); false if it's
  // over its limit. Refills based on elapsed time since the last check.
  private allowMessage(client: Client): boolean {
    const now = Date.now();
    const bucket = this.rateBuckets.get(client.sessionId) ?? {
      tokens: GameRoom.RL_CAPACITY,
      last: now,
    };
    const elapsedSec = (now - bucket.last) / 1000;
    bucket.tokens = Math.min(
      GameRoom.RL_CAPACITY,
      bucket.tokens + elapsedSec * GameRoom.RL_REFILL_PER_SEC,
    );
    bucket.last = now;
    let allowed = false;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      allowed = true;
    }
    this.rateBuckets.set(client.sessionId, bucket);
    return allowed;
  }

  private sendError(client: Client, message: string) {
    client.send("ERROR", { message });
  }

  // Persist the authoritative state and publish a redacted copy to clients.
  // The redacted copy blanks the deck order/pointers (secret information) while
  // keeping everything the UI actually renders. Also flips room status on
  // game-over so both timeout and action paths stay consistent.
  private persist(state: GameState) {
    this.fullState = state;
    const redacted: GameState = { ...state, chanceOrder: [], hustleOrder: [], chancePtr: 0, hustlePtr: 0 };
    this.state.gameStateJson = JSON.stringify(redacted);
    if (state.phase === "game-over") {
      this.state.status = "finished";
    }
  }

  // Single path for mutating game state: apply the action through the pure
  // engine, (re)arm the auction timer if an auction is live, then persist.
  private runEngineAction(playerId: string, action: Action) {
    if (!this.fullState) throw new Error("Game has not started");
    const nextEngineState = applyAction(this.fullState, playerId, action);
    this.armAuctionTimer(nextEngineState);
    this.persist(nextEngineState);

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
  private armTurnTimer(state: GameState) {
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
    const s = this.fullState;
    if (!s) return;
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Turn timeout auto-move failed: ${msg}`);
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

    const engineState = this.fullState;
    if (!engineState) return;
    if (engineState.phase === "game-over") return;

    let actorId: string | null = null;
    // A trade offer addressed to a bot must be answered before its proposer can
    // act again, so it takes priority over the auction/current-player checks.
    const trade = engineState.activeTrade;
    if (trade && isAIPlayer(trade.toId)) {
      const recipient = engineState.players.find((p) => p.id === trade.toId);
      if (recipient && !recipient.bankrupt) actorId = trade.toId;
    }
    if (!actorId) {
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
    }
    if (!actorId) return;

    const delay = 800 + Math.floor(Math.random() * 900); // 0.8–1.7s, feels natural
    const id = actorId;
    this.aiTimer = this.clock.setTimeout(() => this.runAIAction(id), delay);
  }

  private runAIAction(actorId: string) {
    this.aiTimer = undefined;
    if (this.state.status !== "in_progress") return;

    const engineState = this.fullState;
    if (!engineState) return;

    const action = getAIAction(engineState, actorId);
    if (!action) {
      this.scheduleAIIfNeeded();
      return;
    }
    try {
      this.runEngineAction(actorId, action); // persists + reschedules the next AI move
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`AI ${actorId} action failed: ${msg}`);
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
  private armAuctionTimer(state: GameState) {
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
      const engineState = this.fullState;
      if (!engineState || engineState.phase !== "auction") return;
      const nextEngineState = applyAction(engineState, "__server__", { type: "RESOLVE_AUCTION" });
      this.armAuctionTimer(nextEngineState);
      this.persist(nextEngineState);
      this.armTurnTimer(nextEngineState);
      this.scheduleAIIfNeeded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error resolving auction on timeout: ${msg}`);
    }
  }

  onCreate(_options: Record<string, unknown>) {
    this.setState(new GameRoomState());

    // Message handler to select token
    this.onMessage("SELECT_TOKEN", (client, message: { tokenId: string }) => {
      // Never throw out of a message handler: an uncaught throw escapes the ws
      // receiver and crashes the whole server process. Report back to the
      // offending client and bail instead.
      if (this.state.status !== "lobby") {
        this.sendError(client, "Cannot select token once game starts");
        return;
      }
      const player = this.state.lobbyPlayers.get(client.sessionId);
      if (!player) return;

      if (!TOKEN_IDS.includes(message.tokenId)) {
        this.sendError(client, "Unknown token");
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
        this.sendError(client, "That token is already taken");
        return;
      }

      player.tokenId = message.tokenId;
      console.log(`Player ${player.name} selected token: ${message.tokenId}`);
    });

    // Message handler to update lobby settings
    this.onMessage("UPDATE_SETTINGS", (client, message: { startingCash?: number; turnLimit?: number; freeParkingJackpot?: boolean; chaosMode?: boolean; secretObjectives?: boolean; turnTimerEnabled?: boolean; turnTimeoutSecs?: number }) => {
      if (this.state.status !== "lobby") {
        this.sendError(client, "Cannot change settings once game starts");
        return;
      }
      if (client.sessionId !== this.state.hostId) {
        this.sendError(client, "Only the host can modify settings");
        return;
      }

      if (message.startingCash !== undefined) {
        const cash = Number(message.startingCash);
        if (!Number.isFinite(cash) || cash < 100_000 || cash > 10_000_000) {
          this.sendError(client, "Starting cash must be between ₦100,000 and ₦10,000,000");
          return;
        }
        this.state.startingCash = Math.floor(cash);
      }
      if (message.turnLimit !== undefined) {
        const limit = Number(message.turnLimit);
        if (!Number.isFinite(limit) || limit < 0 || limit > 999) {
          this.sendError(client, "Turn limit must be between 0 and 999");
          return;
        }
        this.state.turnLimit = Math.floor(limit);
      }
      if (message.freeParkingJackpot !== undefined) {
        this.state.freeParkingJackpot = !!message.freeParkingJackpot;
      }
      if (message.chaosMode !== undefined) {
        this.state.chaosMode = !!message.chaosMode;
      }
      if (message.secretObjectives !== undefined) {
        this.state.secretObjectives = !!message.secretObjectives;
      }
      if (message.turnTimerEnabled !== undefined) {
        this.state.turnTimerEnabled = !!message.turnTimerEnabled;
      }
      if (message.turnTimeoutSecs !== undefined) {
        const secs = Number(message.turnTimeoutSecs);
        if (!Number.isFinite(secs) || secs < 10 || secs > 600) {
          this.sendError(client, "Turn timeout must be between 10 and 600 seconds");
          return;
        }
        this.state.turnTimeoutSecs = Math.floor(secs);
      }
      console.log(`Lobby settings updated: startingCash=${this.state.startingCash}, turnLimit=${this.state.turnLimit}, jackpot=${this.state.freeParkingJackpot}, turnTimer=${this.state.turnTimerEnabled}/${this.state.turnTimeoutSecs}s`);
    });

    // Message handler to add a computer player (host only, lobby only).
    this.onMessage("ADD_AI", (client) => {
      if (this.state.status !== "lobby") {
        this.sendError(client, "Can only add AI players in the lobby");
        return;
      }
      if (client.sessionId !== this.state.hostId) {
        this.sendError(client, "Only the host can add AI players");
        return;
      }
      if (this.state.lobbyPlayers.size >= MAX_PLAYERS) {
        this.sendError(client, "Room is full");
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
      ai.name = `Bot ${n}`;
      ai.tokenId = token;
      this.state.lobbyPlayers.set(aiId, ai);
      console.log(`Host added computer player ${aiId} (${ai.name})`);
    });

    // Message handler to start game
    this.onMessage("START_GAME", (client, _message) => {
      if (this.state.status !== "lobby") {
        this.sendError(client, "Game is already in progress");
        return;
      }
      if (client.sessionId !== this.state.hostId) {
        this.sendError(client, "Only the host can start the game");
        return;
      }

      const playerIds = Array.from(this.state.lobbyPlayers.keys()) as string[];
      if (playerIds.length < 2) {
        this.sendError(client, "Must have at least 2 players to start");
        return;
      }

      // Initialize the pure game engine state with lobby settings
      const initialEngineState = createGame(playerIds, {
        startingCash: this.state.startingCash,
        turnLimit: this.state.turnLimit,
        freeParkingJackpot: this.state.freeParkingJackpot,
        chaosMode: this.state.chaosMode,
        secretObjectives: this.state.secretObjectives,
      });

      // Map custom lobby player display names back to engine players
      initialEngineState.players.forEach((p) => {
        const lobbyPlayer = this.state.lobbyPlayers.get(p.id);
        if (lobbyPlayer) {
          p.name = lobbyPlayer.name;
        }
      });

      this.persist(initialEngineState);
      this.state.status = "in_progress";
      // Seal the room so no stranger can join a game already in progress
      // (matchmaking would otherwise route "quick play" joiners into it).
      this.lock();

      console.log(`Game started with players: ${playerIds.join(", ")}`);
      // The first player up could be a computer; also start their turn clock.
      this.armTurnTimer(initialEngineState);
      this.scheduleAIIfNeeded();
    });

    // Message handler for player actions
    this.onMessage("ACTION", (client, action: Action) => {
      if (!this.allowMessage(client)) {
        this.sendError(client, "Slow down — too many actions too fast.");
        return;
      }
      if (this.state.status !== "in_progress") {
        this.sendError(client, "Game is not in progress");
        return;
      }

      // RESOLVE_AUCTION is a server-only timer event; clients must not fire it.
      if (action.type === "RESOLVE_AUCTION") {
        this.sendError(client, "Auctions resolve automatically when the timer runs out.");
        return;
      }

      try {
        this.runEngineAction(client.sessionId, action);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.sendError(client, message);
        console.error(`Error applying action from client ${client.sessionId}: ${message}`);
      }
    });

    // Message handler to reset game back to lobby
    this.onMessage("RESET_GAME", (client, _message) => {
      if (client.sessionId !== this.state.hostId) {
        this.sendError(client, "Only the host can reset the game");
        return;
      }
      this.clearAuctionTimer();
      this.clearTurnTimer();
      this.clearAITimer();
      this.state.turnDeadline = 0;
      this.state.status = "lobby";
      this.state.gameStateJson = "";
      this.fullState = null;
      // Reopen the room so players can join the fresh lobby again.
      this.unlock();
      console.log(`Game reset back to lobby by host ${client.sessionId}`);
    });

    // Message handler for chat messages. With `toId` set, the message is a
    // private/direct message delivered only to the sender and that recipient;
    // otherwise it is broadcast to everyone (the general channel).
    this.onMessage("SEND_CHAT", (client, message: { text: string; toId?: string }) => {
      if (!this.allowMessage(client)) {
        this.sendError(client, "Slow down — you're sending messages too fast.");
        return;
      }
      const text = (message.text || "").trim().substring(0, 500);
      if (!text) return;

      const sender = this.state.lobbyPlayers.get(client.sessionId);
      const senderName = sender ? sender.name : "System";
      const tokenId = sender ? sender.tokenId : "";

      const payload: ChatMessage = {
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
    // Only lobby-stage rooms accept new players. The room is also lock()ed on
    // START_GAME, but guard here too so a direct joinById can't seat a stranger
    // in a running game. (Reconnections don't go through onJoin, so they're
    // unaffected.)
    if (this.state.status !== "lobby") {
      throw new Error("This game has already started.");
    }

    const rawName = (options.name || "").trim().substring(0, 20);
    const name = rawName || `Player_${client.sessionId.substring(0, 4)}`;

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

  async onLeave(client: Client, consented?: boolean) {
    console.log(`Client ${client.sessionId} left (consented: ${consented})`);

    if (this.state.status === "lobby") {
      // If still in lobby, remove immediately
      this.state.lobbyPlayers.delete(client.sessionId);
      this.rateBuckets.delete(client.sessionId);
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
        this.rateBuckets.delete(client.sessionId);
        if (this.state.status === "in_progress") {
          try {
            this.runEngineAction(client.sessionId, { type: "FORFEIT" });
            console.log(`Client ${client.sessionId} forfeited after disconnect.`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Error forfeiting disconnected player: ${msg}`);
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
