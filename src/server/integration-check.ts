// Live integration smoke test: drives 3 real WebSocket clients against a
// running server (npm start) to exercise the renamed room, chat routing, and
// the timed/increment auction. Run with: npx tsx src/server/integration-check.ts
import { Client, Room } from "colyseus.js";
import type { ChatMessage } from "../shared/chat";

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

interface Tracked {
  name: string;
  room: Room;
  chats: ChatMessage[];
  errors: any[];
  engine: any;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => boolean, timeout = 8000, interval = 80): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await sleep(interval);
  }
  return false;
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

function track(name: string, room: Room): Tracked {
  const t: Tracked = { name, room, chats: [], errors: [], engine: null };
  room.onStateChange((s: any) => {
    if (s.gameStateJson) {
      try {
        t.engine = JSON.parse(s.gameStateJson);
      } catch {
        /* ignore partial */
      }
    }
  });
  room.onMessage("CHAT_MESSAGE", (m) => t.chats.push(m));
  room.onMessage("ERROR", (m) => t.errors.push(m));
  return t;
}

async function run() {
  const endpoint = "ws://localhost:2567";
  const ca = new Client(endpoint);
  const cb = new Client(endpoint);
  const cc = new Client(endpoint);
  [ca, cb, cc].forEach(patchClientForV017);

  console.log("\n=== 1. JOIN (renamed room id \"odogwu\") ===");
  const ra = await ca.joinOrCreate("odogwu", { name: "Ada" });
  const rb = await cb.joinById(ra.roomId, { name: "Bola" });
  const rc = await cc.joinById(ra.roomId, { name: "Chidi" });
  const A = track("Ada", ra);
  const B = track("Bola", rb);
  const C = track("Chidi", rc);
  const bySession: Record<string, Tracked> = {
    [ra.sessionId]: A,
    [rb.sessionId]: B,
    [rc.sessionId]: C,
  };
  await sleep(600);
  check("3 clients joined the same room", ra.roomId === rb.roomId && rb.roomId === rc.roomId);

  console.log("\n=== 2. PRIVATE vs GENERAL CHAT ===");
  // Private DM from Ada -> Bola
  ra.send("SEND_CHAT", { text: "psst-private", toId: rb.sessionId });
  await waitFor(() => B.chats.some((m) => m.text === "psst-private"), 4000);
  await sleep(400); // give any (incorrect) delivery to Chidi a chance to arrive
  const bGot = B.chats.some((m) => m.text === "psst-private" && m.toId === rb.sessionId);
  const aEcho = A.chats.some((m) => m.text === "psst-private");
  const cLeak = C.chats.some((m) => m.text === "psst-private");
  check("recipient (Bola) received the DM", bGot);
  check("sender (Ada) sees her own DM echoed", aEcho);
  check("third party (Chidi) did NOT receive the DM", !cLeak);

  // General broadcast
  ra.send("SEND_CHAT", { text: "hello-everyone" });
  await waitFor(() => C.chats.some((m) => m.text === "hello-everyone"), 4000);
  const allGotGeneral = [A, B, C].every((x) => x.chats.some((m) => m.text === "hello-everyone" && !m.toId));
  check("general message reached all 3 players", allGotGeneral);

  console.log("\n=== 3. START GAME ===");
  ra.send("SELECT_TOKEN", { tokenId: "okada" });
  rb.send("SELECT_TOKEN", { tokenId: "danfo_bus" });
  rc.send("SELECT_TOKEN", { tokenId: "agbada" });
  await sleep(400);
  ra.send("START_GAME");
  await waitFor(() => A.engine && A.engine.players && A.engine.players.length === 3, 5000);
  check("game started with 3 engine players", !!A.engine && A.engine.players.length === 3);

  console.log("\n=== 4. DRIVE PLAY UNTIL AN AUCTION CAN START ===");
  let auctionStarted = false;
  for (let i = 0; i < 60 && !auctionStarted; i++) {
    const e = A.engine;
    if (!e) {
      await sleep(100);
      continue;
    }
    if (e.phase === "game-over") break;
    if (e.phase === "auction") {
      auctionStarted = true;
      break;
    }
    const cp = e.players[e.currentPlayerIndex];
    const driver = bySession[cp.id];
    if (e.phase === "awaiting-roll") {
      const before = e.log.length;
      driver.room.send("ACTION", { type: "ROLL" });
      await waitFor(() => A.engine && A.engine.log.length > before, 4000);
    } else if (e.phase === "awaiting-buy-decision") {
      driver.room.send("ACTION", { type: "DECLINE_BUY" });
      auctionStarted = await waitFor(() => A.engine && A.engine.phase === "auction", 4000);
    } else if (e.phase === "awaiting-end-turn") {
      const idx = e.currentPlayerIndex;
      driver.room.send("ACTION", { type: "END_TURN" });
      await waitFor(
        () => A.engine && (A.engine.currentPlayerIndex !== idx || A.engine.phase !== "awaiting-end-turn"),
        4000,
      );
    } else {
      await sleep(120);
    }
  }
  check("an auction was triggered via DECLINE_BUY", auctionStarted);

  if (auctionStarted) {
    console.log("\n=== 5. AUCTION: increments + timed auto-resolve ===");
    const a = A.engine.auctionState;
    const tilePos = a.tilePos;
    const bidderId = a.participantIds[0];
    const bidder = bySession[bidderId];
    const inc = a.bidIncrements[0];
    console.log(`  (tile #${tilePos}, increments ₦${a.bidIncrements.join(" / ₦")}, ${a.bidDurationMs}ms window)`);

    // Invalid bid: not a set increment -> server should reject with ERROR.
    const errBefore = bidder.errors.length;
    bidder.room.send("ACTION", { type: "BID", amount: a.highestBid + 1 });
    const gotErr = await waitFor(() => bidder.errors.length > errBefore, 4000);
    check("off-increment bid rejected by server", gotErr && A.engine.auctionState?.highestBid === 0);

    // Valid bid: one increment above current.
    bidder.room.send("ACTION", { type: "BID", amount: a.highestBid + inc });
    const bidLanded = await waitFor(
      () => A.engine.auctionState && A.engine.auctionState.highestBidderId === bidderId,
      4000,
    );
    check("valid increment bid accepted", bidLanded);

    // Do nothing else: the server's countdown should auto-resolve to the bidder.
    console.log("  ⏳ waiting for the auction timer to expire (~12s)...");
    const resolved = await waitFor(() => A.engine && A.engine.phase !== "auction", 16000);
    check("auction auto-resolved when the timer expired", resolved);
    check(
      "timer awarded the tile to the top bidder",
      resolved && A.engine.tiles[tilePos]?.ownerId === bidderId,
    );
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await ra.leave();
  await rb.leave();
  await rc.leave();
  await sleep(300);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Integration check crashed:", e);
  process.exit(1);
});
