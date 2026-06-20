import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT || 2567);

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built client files
const clientBuildPath = path.resolve(__dirname, "../../dist");

// 1. Create the Express application
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.send("Odogwu Empire Server is running!");
});

// Serve the built Vite client as static files
app.use(express.static(clientBuildPath));

// SPA fallback — Express 5 uses {*path} instead of *
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// 2. Create the HTTP server
const httpServer = createServer(app);

// 3. Initialize Colyseus Game Server using the HTTP server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

// Register the game room
gameServer.define("odogwu", GameRoom);

// Start listening
httpServer.listen(port, () => {
  console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);
  console.log(`Serving client from ${clientBuildPath}`);
});

