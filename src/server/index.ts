import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { Server } from "colyseus";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT || 2567);

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built client files
const clientBuildPath = path.resolve(__dirname, "../../dist");

// Express app: CORS, JSON, health check, and serving the built client.
const app = express();

// Configure CORS with dynamic origin matching to support credentials
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const isAllowed =
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.endsWith(".onrender.com");

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`CORS: Blocked request from untrusted origin ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Health check endpoint
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.send("Odogwu Empire Server is running!");
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
const gameServer = new Server({
  server: createServer(app),
});

// Register the game room
gameServer.define("odogwu", GameRoom);

// Start listening
gameServer.listen(port).then(() => {
  console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);
  console.log(`Serving client from ${clientBuildPath}`);
});
