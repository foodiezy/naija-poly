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
const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(cors({ origin: "*" }));
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (_req, res) => {
      res.send("Odogwu Empire Server is running!");
    });
  },
});

// Register the game room
gameServer.define("odogwu", GameRoom);

// Start listening, THEN add static file serving after Colyseus routes are set up
gameServer.listen(port).then(() => {
  console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);

  // Get the underlying Express app and add static serving AFTER Colyseus routes
  const app = (gameServer.transport as any).app as express.Express;

  // Serve the built Vite client as static files
  app.use(express.static(clientBuildPath));

  // SPA fallback — Express 5 uses {*path} instead of *
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });

  console.log(`Serving client from ${clientBuildPath}`);
});
