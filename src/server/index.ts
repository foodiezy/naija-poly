import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { Server, matchMaker } from "colyseus";
import { GameRoom, notifyAllRooms } from "./GameRoom";
import { configuredOrigins, isOriginAllowed } from "./originPolicy";

const port = Number(process.env.PORT || 2567);

// How long players get to see the restart notice before rooms are disposed.
// Render's SIGTERM grace window is ~30s, so this is deliberately well inside it.
const SHUTDOWN_DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS || 3000);

// Set as soon as a shutdown starts, so /health reports 503 and the load
// balancer stops sending new players to a process that is going away.
let shuttingDown = false;

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built client files
const clientBuildPath = path.resolve(__dirname, "../../dist");

// Express app: CORS, JSON, health check, and serving the built client.
const app = express();

// Configure CORS. In production we pin the exact allowed origin(s) via the
// ALLOWED_ORIGINS env var (comma-separated) rather than trusting every
// *.onrender.com app — combined with credentials:true, a suffix match would
// let any other Render-hosted site make credentialed requests to us. Local
// dev origins are allowed only outside production. Render injects
// RENDER_EXTERNAL_URL (this service's own public URL); allowing it keeps
// same-origin matchmaking POSTs working when ALLOWED_ORIGINS is unset, without
// trusting other apps.
const originPolicy = {
  allowedOrigins: configuredOrigins(process.env.ALLOWED_ORIGINS, process.env.RENDER_EXTERNAL_URL),
  isProduction: process.env.NODE_ENV === "production",
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, originPolicy)) {
        callback(null, true);
      } else {
        console.warn(`CORS: Blocked request from untrusted origin ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

// Health check. This used to return a static string, which meant Render's
// health check stayed green even when matchmaking was dead — the one failure
// that actually makes the game unplayable. Now it does a real round-trip
// through the matchmaker's driver and answers 503 when that fails, so a broken
// deploy is rolled back instead of served.
app.get("/health", async (_req: express.Request, res: express.Response) => {
  if (shuttingDown) {
    res.status(503).json({ status: "shutting-down" });
    return;
  }
  try {
    const rooms = await matchMaker.query({});
    res.status(200).json({ status: "ok", rooms: rooms.length });
  } catch (err) {
    console.error("[health] matchmaker query failed:", err);
    res.status(503).json({ status: "degraded", error: (err as Error).message });
  }
});

// Client crash sink. There is no Sentry here on purpose — a portfolio demo
// does not need a SaaS account and the bundle just fought for every KB — but
// "the app went white and nobody knows why" is the one thing worth catching.
// ErrorBoundary posts here; the line lands in Render's log stream.
app.post("/api/error", (req: express.Request, res: express.Response) => {
  const { message, stack, url } = (req.body ?? {}) as Record<string, unknown>;
  console.error(
    "[client-error]",
    JSON.stringify({
      message: String(message ?? "").slice(0, 500),
      url: String(url ?? "").slice(0, 300),
      stack: String(stack ?? "").slice(0, 2000),
      at: new Date().toISOString(),
    }),
  );
  res.status(204).end();
});

// Serve the built Vite client as static files
app.use(express.static(clientBuildPath));

// SPA fallback — Express 5 uses {*path} instead of *
app.get("/{*path}", (_req: express.Request, res: express.Response) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Initialize Colyseus Game Server. We let Colyseus build its own default
// WebSocketTransport (passing our Express HTTP server via `server`) rather than
// importing WebSocketTransport ourselves — importing it from a separate package
// can bind a second copy of @colyseus/core, giving the transport a different
// matchMaker than the Server's (rooms register in one, the WS upgrade looks them
// up in the other → "seat reservation expired"). Sharing one instance fixes it.
// Bound to a variable rather than constructed inline: shutdown needs to be
// able to close it.
const httpServer = createServer(app);

const gameServer = new Server({
  server: httpServer,
  // We register the signal handlers ourselves (below). Colyseus's built-in
  // handler disposes every room BEFORE running its onShutdown callback, so
  // there is no point at which a "we're restarting" notice could reach a
  // player — by the time the callback runs, their room is already gone.
  gracefullyShutdown: false,
});

// Register the game room
gameServer.define("odogwu", GameRoom);

// Start listening
gameServer
  .listen(port)
  .then(() => {
    console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);
    console.log(`Serving client from ${clientBuildPath}`);
  })
  .catch((err) => {
    // Previously unhandled: a port bind failure surfaced only as an unhandled
    // rejection, so the process lingered looking healthy but serving nothing.
    console.error(`[startup] failed to listen on ${port}:`, err);
    process.exit(1);
  });

/**
 * Drain, then stop. Every push to main used to kill live games mid-turn with
 * no warning; players just saw the connection drop. Now they get told, the
 * process stops accepting new players, and rooms are disposed cleanly.
 */
async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${reason} — draining for ${SHUTDOWN_DRAIN_MS}ms`);

  notifyAllRooms("Server dey restart — hold on small, the game go come back.");
  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_MS));

  try {
    // false: don't let Colyseus call process.exit, so we can close the HTTP
    // server ourselves afterwards.
    await gameServer.gracefullyShutdown(false);
  } catch (err) {
    console.error("[shutdown] gracefullyShutdown failed:", err);
  }

  httpServer.close(() => {
    console.log("[shutdown] closed cleanly");
    process.exit(0);
  });
  // Belt and braces: a hung keep-alive socket must not out-wait Render's
  // grace window and turn a clean stop into a SIGKILL.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

// Turning off Colyseus's built-in shutdown also removed its uncaughtException
// handler, so these replace it rather than add to it. An uncaught throw is not
// survivable state — log it and go down cleanly instead of serving a process
// in unknown condition.
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
});
