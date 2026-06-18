import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RichupRoom } from "./RichupRoom";

const port = Number(process.env.PORT || 2567);

// Initialize Colyseus Game Server
const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(cors({
      origin: [
        "http://localhost:5173",
        "https://naija-richup.onrender.com",
      ],
      credentials: true,
    }));
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (_req, res) => {
      res.send("Odogwu Empire Server is running!");
    });
  }
});

// Register the game room
gameServer.define("richup", RichupRoom);

// Start listening via gameServer.listen
gameServer.listen(port).then(() => {
  console.log(` Odogwu Empire Server is listening on http://localhost:${port}`);
});
