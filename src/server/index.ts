import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RichupRoom } from "./RichupRoom";

const port = Number(process.env.PORT || 2567);

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.send("Odogwu Empire Server is running!");
});

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("richup", RichupRoom);

httpServer.listen(port, () => {
  console.log(`Odogwu Empire Server is listening on http://localhost:${port}`);
});
