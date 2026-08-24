// Live bot smoke test. Run with the dev server listening on port 2567.
import { Client, Room } from "colyseus.js";
import type { GameState } from "../engine/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn: () => boolean, timeout = 12_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (fn()) return true;
    await sleep(80);
  }
  return false;
}

// The 0.16 server returns the reservation shape expected by its own client.
// Our newer client expects the nested room object, so mirror the existing live
// integration check until both Colyseus packages are upgraded together.
function patchClientForV017(client: Client) {
  const originalConsume = (client as any).consumeSeatReservation.bind(client);
  (client as any).consumeSeatReservation = function (response: any, rootSchema: any, reuse: any) {
    if (response && !response.room) {
      response.room = {
        name: response.name || "odogwu",
        roomId: response.roomId,
        processId: response.processId,
        publicAddress: response.publicAddress,
      };
    }
    return originalConsume(response, rootSchema, reuse);
  };
}

async function run() {
  const client = new Client("ws://localhost:2567");
  patchClientForV017(client);

  const room: Room = await client.create("odogwu", { name: "Fuad" });
  let engine: GameState | null = null;
  const errors: string[] = [];

  room.onStateChange((state: any) => {
    if (state.gameStateJson) engine = JSON.parse(state.gameStateJson) as GameState;
  });
  room.onMessage("ERROR", (message: { message: string }) => errors.push(message.message));

  await sleep(250);
  room.send("SELECT_TOKEN", { tokenId: "okada" });
  room.send("ADD_AI");
  if (!(await waitFor(() => (room.state as any).lobbyPlayers?.size === 2))) {
    throw new Error("Bot did not join the lobby");
  }

  room.send("START_GAME");
  if (!(await waitFor(() => !!engine && engine.players.length === 2))) {
    throw new Error("Game did not start");
  }

  const humanId = room.sessionId;
  const bot = engine!.players.find((player) => player.id.startsWith("ai_"));
  if (!bot) throw new Error("Bot missing from engine state");
  console.log(`PASS: ${bot.name} joined and the game started`);

  // Complete the human's first turn so control reaches the server-owned bot.
  for (let steps = 0; steps < 16; steps++) {
    const state = engine!;
    const current = state.players[state.currentPlayerIndex];
    if (current.id !== humanId) break;

    const beforeLog = state.log.length;
    const beforePhase = state.phase;
    if (state.phase === "awaiting-roll") room.send("ACTION", { type: "ROLL" });
    else if (state.phase === "awaiting-buy-decision") room.send("ACTION", { type: "BUY" });
    else if (state.phase === "awaiting-end-turn") room.send("ACTION", { type: "END_TURN" });
    else throw new Error(`Unexpected human phase: ${state.phase}`);

    const advanced = await waitFor(() => {
      const next = engine!;
      return (
        next.log.length > beforeLog ||
        next.phase !== beforePhase ||
        next.players[next.currentPlayerIndex].id !== humanId
      );
    }, 5_000);
    if (!advanced) throw new Error(`Human action stalled in ${beforePhase}`);
  }

  if (engine!.players[engine!.currentPlayerIndex].id !== bot.id) {
    throw new Error("Bot never received its turn");
  }
  console.log("PASS: Turn passed to the bot");

  const botLogStart = engine!.log.length;
  const botFinished = await waitFor(() => {
    const state = engine!;

    // Keep the human from blocking a bot auction or trade while we observe the
    // autonomous turn.
    if (state.activeTrade?.toId === humanId) {
      room.send("ACTION", { type: "RESPOND_TRADE", accept: false });
    }
    if (state.phase === "auction" && state.auctionState) {
      const auction = state.auctionState;
      if (
        auction.participantIds.includes(humanId) &&
        !auction.passedIds.includes(humanId) &&
        auction.highestBidderId !== humanId
      ) {
        room.send("ACTION", { type: "PASS_BID" });
      }
    }

    const botRolled = state.log
      .slice(botLogStart)
      .some((line) => line.includes(`${bot.name} rolled`));
    const humanTurn = state.players[state.currentPlayerIndex].id === humanId;
    return botRolled && humanTurn;
  }, 25_000);

  if (!botFinished) {
    throw new Error(`Bot turn stalled in ${engine!.phase}. ${errors.join(" | ")}`);
  }

  console.log("PASS: Bot rolled, resolved its landing, and returned control");
  console.log("RESULT: real server bot playtest passed");
  await room.leave();
  await sleep(200);
}

run().catch((error) => {
  console.error("Bot integration check failed:", error);
  process.exit(1);
});
