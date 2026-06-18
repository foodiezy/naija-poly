import { Client } from "colyseus.js";

function patchClientForV017(client: Client) {
  const originalConsume = (client as any).consumeSeatReservation.bind(client);
  (client as any).consumeSeatReservation = function(response: any, rootSchema: any, reuseRoomInstance: any) {
    if (response && !response.room) {
      response.room = {
        name: response.name || "richup",
        roomId: response.roomId,
        processId: response.processId,
        publicAddress: response.publicAddress
      };
    }
    return originalConsume(response, rootSchema, reuseRoomInstance);
  };
}

async function runTestClient() {
  console.log("Starting Colyseus Richup Test Client...");
  
  const clientA = new Client("ws://localhost:2567");
  const clientB = new Client("ws://localhost:2567");
  
  patchClientForV017(clientA);
  patchClientForV017(clientB);

  try {
    // 1. Join room for Player A
    console.log("Player A joining richup room...");
    const roomA = await clientA.joinOrCreate("richup", { name: "Chidi" });
    console.log(`Player A joined room: ${roomA.roomId} with sessionId: ${roomA.sessionId}`);

    // 2. Join room for Player B
    console.log("Player B joining richup room...");
    const roomB = await clientB.join("richup", { name: "Funmi" });
    console.log(`Player B joined room with sessionId: ${roomB.sessionId}`);

    // Set up state listeners for Room A
    roomA.onStateChange((state) => {
      console.log("\n--- [Room State Updated] ---");
      console.log(`Status: ${state.status}`);
      console.log(`Host ID: ${state.hostId}`);
      console.log(`Lobby Players count: ${state.lobbyPlayers.size}`);
      
      state.lobbyPlayers.forEach((player: any, id: string) => {
        console.log(` - Player ${id}: name="${player.name}", tokenId="${player.tokenId}"`);
      });

      if (state.gameStateJson) {
        try {
          const engineState = JSON.parse(state.gameStateJson);
          console.log(`Engine Phase: ${engineState.phase}`);
          console.log(`Players in Engine: ${engineState.players.map((p: any) => `${p.name} (pos: ${p.position}, cash: ₦${p.cash.toLocaleString()})`).join(", ")}`);
          if (engineState.log && engineState.log.length > 0) {
            console.log(`Latest Engine Logs:`);
            engineState.log.slice(-3).forEach((l: string) => console.log(`   👉 ${l}`));
          }
        } catch (e) {
          console.error("Failed to parse engine state JSON", e);
        }
      }
      console.log("----------------------------\n");
    });

    roomA.onMessage("ERROR", (message) => {
      console.error(`❌ [SERVER ERROR MESSAGE]:`, message);
    });

    // Wait 1 second to ensure join notifications are processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. Player A selects token "danfo_bus"
    console.log("Player A selecting token: danfo_bus");
    roomA.send("SELECT_TOKEN", { tokenId: "danfo_bus" });

    // 4. Player B selects token "okada"
    console.log("Player B selecting token: okada");
    roomB.send("SELECT_TOKEN", { tokenId: "okada" });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 5. Host (Player A) starts the game
    console.log("Host (Player A) starting game...");
    roomA.send("START_GAME");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 6. Current player rolls the dice
    console.log("Sending ROLL action from Player A...");
    roomA.send("ACTION", { type: "ROLL" });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 7. Try to buy the property they landed on
    console.log("Sending BUY action from Player A...");
    roomA.send("ACTION", { type: "BUY" });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 8. End turn
    console.log("Sending END_TURN action from Player A...");
    roomA.send("ACTION", { type: "END_TURN" });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Clean up
    console.log("Disconnecting clients...");
    await roomA.leave();
    await roomB.leave();
    console.log("Test client completed successfully!");
  } catch (error) {
    console.error("Test client failed:", error);
    process.exit(1);
  }
}

runTestClient();
