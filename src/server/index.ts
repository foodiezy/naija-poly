import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RichupRoom } from "./RichupRoom";

const port = Number(process.env.PORT || 2567);

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
  },
});

// Register the game room
gameServer.define("richup", RichupRoom);

// Start listening
gameServer.listen(port).then(() => {
  console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);
});
