import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT || 2567);

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the built client files
const clientBuildPath = path.resolve(__dirname, "../../dist");

// Initialize Colyseus Game Server.
// The `express` callback receives the transport's Express app BEFORE the
// matchmaking routes are registered, so middleware added here (CORS, JSON)
// applies to /matchmake/* as well.
const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(cors({ origin: "*" }));
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (_req, res) => {
      res.send("Odogwu Empire Server is running!");
    });

    // Serve the built Vite client as static files
    app.use(express.static(clientBuildPath));

    // SPA fallback: any non-API/non-WS route serves index.html
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientBuildPath, "index.html"));
    });
  },
});

// Register the game room
gameServer.define("odogwu", GameRoom);

// Start listening
gameServer.listen(port).then(() => {
  console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);
});
