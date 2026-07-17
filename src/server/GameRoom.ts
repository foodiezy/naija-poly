import { Schema, type, MapSchema } from "@colyseus/schema";
import { Room, Client } from "colyseus";
import {
  createGame,
  applyAction,
  pendingChaosDecider,
  defaultChaosResolution,
} from "../engine/engine";
import { getAIAction } from "../engine/ai";
import type { Action, GameState } from "../engine/types";

// How long a Chaos-mode interactive decision (aim the blackout, stockpile
// fork, fire-sale pick, EFCC settlement) stays open before the server
// auto-resolves it with a safe default. Like the auction timer, this runs
// regardless of the optional per-turn AFK timer: a chaos decision blocks every
// player, so it must never be able to hang the room.
const CHAOS_DECISION_MS = 20_000;
import { TOKEN_IDS, MAX_PLAYERS } from "../data/tokens";
import { censorProfanity } from "../data/profanity";
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
  // Server-owned countdown for a live Chaos-mode interactive decision.
  private decisionTimer?: ReturnType<typeof this.clock.setTimeout>;
  // Pending scheduled move for a computer player.
  private aiTimer?: ReturnType<typeof this.clock.setTimeout>;
  // Last AI trade proposal (actor + round). The engine is pure and a declined
  // trade leaves no trace in state, so without this memory a "Trader" bot
  // whose offer was declined would re-propose the identical trade forever.
  private lastAITradeProposal?: { actorId: string; round: number };
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

  // Last line of defence against a malformed payload slipping past the
  // per-handler guards: with this hook defined, Colyseus wraps every message
  // handler / clock callback in try/catch, so one bad client message can no
  // longer take down the whole Node process (every room on the server).
  onUncaughtException(err: Error, methodName: string) {
    console.error(`Uncaught exception in room ${this.roomId} (${methodName}):`, err);
  }

  // Persist the authoritative state and publish a redacted copy to clients.
  // The redacted copy blanks the deck order/pointers and hides players'
  // secret objectives (each player receives their own via a targeted message;
  // all are revealed once the game is over). Also flips room status on
  // game-over so both timeout and action paths stay consistent.
  private persist(state: GameState) {
    this.fullState = state;
    const redacted: GameState = {
      ...state,
      chanceOrder: [],
      hustleOrder: [],
      chancePtr: 0,
      hustlePtr: 0,
      players:
        state.phase === "game-over"
          ? state.players
          : state.players.map((p) => ({ ...p, secretObjective: undefined })),
    };
    this.state.gameStateJson = JSON.stringify(redacted);
    if (state.phase === "game-over") {
      this.state.status = "finished";
    }
  }

  // Privately tell a player (or everyone, if no client given) their own secret
  // objective — it is stripped from the broadcast state so devtools can't
  // reveal opponents' objectives.
  private sendSecretObjective(target?: Client) {
    const state = this.fullState;
    if (!state || !state.settings.secretObjectives) return;
    const recipients = target ? [target] : this.clients;
    for (const client of recipients) {
      const p = state.players.find((pl) => pl.id === client.sessionId);
      if (p?.secretObjective) {
        client.send("SECRET_OBJECTIVE", {
          objective: p.secretObjective,
          completed: !!p.objectiveCompleted,
        });
      }
    }
  }

  // Host must always be a connected human — never a bot id or a dead session.
  // Without this, a departing host leaves the room unstartable/unresettable.
  private migrateHostIfNeeded(leftId: string) {
    if (this.state.hostId !== leftId) return;
    const next = this.clients.find((c) => c.sessionId !== leftId);
    this.state.hostId = next ? next.sessionId : "";
  }

  // Single path for mutating game state: apply the action through the pure
  // engine, (re)arm the auction timer if an auction is live, then persist.
  private runEngineAction(playerId: string, action: Action) {
    if (!this.fullState) throw new Error("Game has not started");
    const nextEngineState = applyAction(this.fullState, playerId, action);
    this.armAuctionTimer(nextEngineState);
    this.armDecisionTimer(nextEngineState);
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

  // The active human ran out of time: make a safe, neutral move so play
  // continues. Attempts are a ladder — END_TURN first (the engine auto-settles
  // any debt the player can afford), falling back to DECLARE_BANKRUPT for a
  // debtor who genuinely can't pay. If everything fails, re-arm the timer so
  // the game can never silently stall on an AFK player.
  private onTurnTimeout() {
    this.turnTimer = undefined;
    if (this.state.status !== "in_progress") return;
    const s = this.fullState;
    if (!s) return;
    if (s.phase === "auction" || s.phase === "game-over") return;
    const current = s.players[s.currentPlayerIndex];
    if (!current || current.bankrupt || isAIPlayer(current.id)) return;

    let attempts: Action[] = [];
    if (s.phase === "awaiting-roll") attempts = [{ type: "ROLL" }];
    else if (s.phase === "awaiting-buy-decision") attempts = [{ type: "DECLINE_BUY" }];
    else if (s.phase === "awaiting-end-turn")
      attempts = [{ type: "END_TURN" }, { type: "DECLARE_BANKRUPT" }];
    if (attempts.length === 0) return;

    for (const action of attempts) {
      try {
        this.runEngineAction(current.id, action);
        this.broadcast("ERROR", {
          message: `${current.name} ran out of time — auto-played their turn.`,
        });
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Turn timeout auto-move (${action.type}) failed: ${msg}`);
      }
    }
    // Nothing worked (unexpected): give the player another window rather than
    // leaving the game with no timer at all.
    this.armTurnTimer(s);
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
      // A live chaos decision (which may belong to a non-current player, e.g.
      // an EFCC target) takes priority: if a bot must decide, let it.
      const chaosDecider = pendingChaosDecider(engineState);
      if (chaosDecider && isAIPlayer(chaosDecider)) {
        actorId = chaosDecider;
      } else if (engineState.phase === "auction" && engineState.auctionState) {
        const a = engineState.auctionState;
        actorId =
          a.participantIds.find(
            (id: string) => isAIPlayer(id) && !a.passedIds.includes(id) && a.highestBidderId !== id,
          ) ?? null;
      } else if (pendingChaosDecider(engineState) === null) {
        // Only hand the turn to the current bot when no chaos decision is
        // pending (a pending decision owned by a human must not be pre-empted).
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

    // A pending chaos decision isn't something the general AI planner models —
    // resolve it with the engine's safe default (take-now / decline / settle).
    if (pendingChaosDecider(engineState) === actorId) {
      const chaosMove = defaultChaosResolution(engineState);
      if (chaosMove) {
        try {
          this.runEngineAction(actorId, chaosMove);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`AI ${actorId} chaos decision failed: ${msg}`);
          this.scheduleAIIfNeeded();
        }
        return;
      }
    }

    const suppressTradeProposal =
      this.lastAITradeProposal?.actorId === actorId &&
      this.lastAITradeProposal.round === engineState.currentTurn;
    const action = getAIAction(engineState, actorId, { suppressTradeProposal });
    if (!action) {
      this.scheduleAIIfNeeded();
      return;
    }
    if (action.type === "PROPOSE_TRADE") {
      this.lastAITradeProposal = { actorId, round: engineState.currentTurn };
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

  private clearDecisionTimer() {
    if (this.decisionTimer) {
      this.decisionTimer.clear();
      this.decisionTimer = undefined;
    }
  }

  // Stamp a deadline onto the live chaos decision and schedule its auto-resolve.
  // Called after every engine action: arms the window while a chaos decision is
  // pending, and clears the timer once it is resolved. Human deciders get the
  // full window; the AI scheduler resolves bot deciders sooner (see below).
  private armDecisionTimer(state: GameState) {
    this.clearDecisionTimer();
    const decider = pendingChaosDecider(state);
    if (!decider) return;
    const deadline = Date.now() + CHAOS_DECISION_MS;
    // Surface the countdown to clients via the pending field's `deadline`.
    const pending =
      state.pendingBlackout ?? state.pendingStockpile ?? state.pendingFireSale ?? state.pendingEfcc;
    if (pending) pending.deadline = deadline;
    this.decisionTimer = this.clock.setTimeout(() => this.onDecisionTimeout(), CHAOS_DECISION_MS);
  }

  private onDecisionTimeout() {
    this.decisionTimer = undefined;
    if (this.state.status !== "in_progress") return;
    const state = this.fullState;
    if (!state) return;
    const decider = pendingChaosDecider(state);
    const fallback = defaultChaosResolution(state);
    if (!decider || !fallback) return;
    try {
      this.runEngineAction(decider, fallback);
      this.broadcast("ERROR", {
        message: `The chaos decision timed out — resolved automatically.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error auto-resolving chaos decision: ${msg}`);
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
      // offending client and bail instead. Payloads are attacker-controlled:
      // guard the shape before dereferencing anything.
      if (!message || typeof message.tokenId !== "string") {
        this.sendError(client, "Malformed message");
        return;
      }
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
    this.onMessage(
      "UPDATE_SETTINGS",
      (
        client,
        message: {
          startingCash?: number;
          turnLimit?: number;
          freeParkingJackpot?: boolean;
          chaosMode?: boolean;
          secretObjectives?: boolean;
          turnTimerEnabled?: boolean;
          turnTimeoutSecs?: number;
        },
      ) => {
        if (!message || typeof message !== "object") {
          this.sendError(client, "Malformed message");
          return;
        }
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
        console.log(
          `Lobby settings updated: startingCash=${this.state.startingCash}, turnLimit=${this.state.turnLimit}, jackpot=${this.state.freeParkingJackpot}, turnTimer=${this.state.turnTimerEnabled}/${this.state.turnTimeoutSecs}s`,
        );
      },
    );

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
      // Each player learns their own secret objective privately; the broadcast
      // state carries none of them.
      this.sendSecretObjective();
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
      // Guard the shape before any dereference: `room.send("ACTION")` with no
      // payload must not be able to throw out of this handler.
      if (!action || typeof action !== "object" || typeof action.type !== "string") {
        this.sendError(client, "Malformed action");
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

    // A reconnecting client re-registers its message handlers from scratch, so
    // it asks for its secret objective again rather than relying on a race-free
    // push right after the reconnection resolves.
    this.onMessage("REQUEST_OBJECTIVE", (client) => {
      if (!this.allowMessage(client)) return;
      this.sendSecretObjective(client);
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
      this.lastAITradeProposal = undefined;
      // Drop ghosts: humans who left mid-game stay in lobbyPlayers while the
      // game runs (their engine player is forfeited), but a fresh lobby must
      // only seat connected clients and bots — otherwise the next START_GAME
      // deals a hand to someone who is never coming back.
      const connected = new Set(this.clients.map((c) => c.sessionId));
      Array.from(this.state.lobbyPlayers.keys()).forEach((id) => {
        if (!isAIPlayer(id) && !connected.has(id)) {
          this.state.lobbyPlayers.delete(id);
        }
      });
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
      // Payload shape guard: `text` may be missing or a non-string; a bad
      // `toId` type must not reach the MapSchema lookup.
      if (!message || typeof message.text !== "string") return;
      const toId = typeof message.toId === "string" ? message.toId : null;
      const trimmed = message.text.trim().substring(0, 500);
      if (!trimmed) return;
      // Censor curses/slurs before the message leaves the server, so no client
      // (recipient OR sender echo) ever receives the raw text.
      const text = censorProfanity(trimmed);

      const sender = this.state.lobbyPlayers.get(client.sessionId);
      const senderName = sender ? sender.name : "System";
      const tokenId = sender ? sender.tokenId : "";

      const payload: ChatMessage = {
        senderId: client.sessionId,
        senderName,
        tokenId,
        text,
        timestamp: Date.now(),
        toId,
      };

      if (toId) {
        // Private: send to the recipient (if connected) and echo to the sender.
        const recipient = this.state.lobbyPlayers.get(toId);
        payload.toName = recipient ? recipient.name : "Player";
        const recipientClient = this.clients.find((c) => c.sessionId === toId);
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
      throw new Error("This game don start already — ask your friend to create a new room.");
    }

    // maxClients only counts sockets — AI players occupy lobby seats without
    // one, so enforce the roster cap here too or a full-of-bots room would
    // seat more players than there are distinct tokens.
    if (this.state.lobbyPlayers.size >= MAX_PLAYERS) {
      throw new Error("Room is full.");
    }

    const rawName = (typeof options?.name === "string" ? options.name : "").trim().substring(0, 20);
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
      // Never hand the host seat to a bot — the room would be unstartable.
      this.migrateHostIfNeeded(client.sessionId);
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
        // A permanent leaver must not linger as a ghost: drop their lobby
        // seat (so rematches don't deal them in) and migrate the host role to
        // a connected human (so the room stays resettable).
        this.state.lobbyPlayers.delete(client.sessionId);
        this.migrateHostIfNeeded(client.sessionId);
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
