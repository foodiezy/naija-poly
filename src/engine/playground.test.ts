import { describe, it } from "vitest";
import { createGame, applyAction } from "./engine";
import { formatNaira } from "../data/board";

describe("Odogwu Empire Console Playground", () => {
  it("runs a simulated game play-through", () => {
    console.log("\n=======================================================");
    console.log("        ODOGWU EMPIRE GAME SIMULATION              ");
    console.log("=======================================================\n");

    const playerIds = ["Chidi", "Funmi", "Tunde"];
    
    // We use a custom sequence of dice rolls to show off different engine features:
    // Turn 1 (Chidi): Rolls [1, 2] -> lands on Mushin (pos 3), buys it.
    // Turn 2 (Funmi): Rolls [2, 3] -> lands on MM Airport (pos 5), buys it.
    // Turn 3 (Tunde): Rolls [3, 4] -> lands on Chance (pos 7), draws card.
    // Turn 4 (Chidi): Rolls [1, 1] (doubles) -> lands on MM Airport (pos 5), pays rent to Funmi. Rerolls [1, 2] -> lands on Yaba (pos 8), buys it.
    const mockRolls: [number, number][] = [
      [1, 2], // Chidi
      [2, 3], // Funmi
      [3, 4], // Tunde (Chance)
      [1, 1], // Chidi (doubles -> MM Airport)
      [1, 2], // Chidi (reroll -> Yaba)
    ];

    let rollIndex = 0;
    const rng = () => {
      if (rollIndex >= mockRolls.length * 2) {
        // Fallback random-ish rolls
        return 0.5; 
      }
      const pairIndex = Math.floor(rollIndex / 2);
      const isFirst = rollIndex % 2 === 0;
      rollIndex++;
      return ((mockRolls[pairIndex][isFirst ? 0 : 1] - 0.5) / 6);
    };

    let state = createGame(playerIds);
    printState(state);

    // --- Turn 1: Chidi ---
    console.log("\n--- Turn 1: Chidi ---");
    state = applyAction(state, "Chidi", { type: "ROLL" }, rng);
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "BUY" });
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "END_TURN" });

    // --- Turn 2: Funmi ---
    console.log("\n--- Turn 2: Funmi ---");
    state = applyAction(state, "Funmi", { type: "ROLL" }, rng);
    printLogs(state);
    state = applyAction(state, "Funmi", { type: "BUY" });
    printLogs(state);
    state = applyAction(state, "Funmi", { type: "END_TURN" });

    // --- Turn 3: Tunde ---
    console.log("\n--- Turn 3: Tunde ---");
    state = applyAction(state, "Tunde", { type: "ROLL" }, rng); // Lands on Chance (pos 7), draws card
    printLogs(state);
    if (state.phase === "awaiting-buy-decision") {
      state = applyAction(state, "Tunde", { type: "BUY" });
      printLogs(state);
    }
    state = applyAction(state, "Tunde", { type: "END_TURN" });

    // --- Turn 4: Chidi (Doubles Reroll & Rent Pay) ---
    console.log("\n--- Turn 4: Chidi (Doubles & Rent) ---");
    state = applyAction(state, "Chidi", { type: "ROLL" }, rng); // Lands on pos 5 (MM Airport owned by Funmi) -> pays rent
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "END_TURN" }); // Has doubles, so gets another roll
    printLogs(state);
    
    state = applyAction(state, "Chidi", { type: "ROLL" }, rng); // Rolls [1, 2] -> lands on Yaba (pos 8)
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "BUY" });
    printLogs(state);
    state = applyAction(state, "Chidi", { type: "END_TURN" });

    // --- Show Final States ---
    console.log("\n=======================================================");
    console.log("                  FINAL GAME STATE                    ");
    console.log("=======================================================");
    printState(state);
    console.log("\n=======================================================\n");
  });
});

function printLogs(state: any) {
  const newLogs = state.log.slice(printLogs.lastLength || 0);
  newLogs.forEach((log: string) => console.log(`👉 ${log}`));
  printLogs.lastLength = state.log.length;
}
printLogs.lastLength = 0;

function printState(state: any) {
  console.log("\nPlayers:");
  state.players.forEach((p: any) => {
    console.log(`- ${p.name}: Cash: ${formatNaira(p.cash)}, Position: ${p.position} (Tile: ${p.inJail ? "Jail" : "Active"})`);
  });
  console.log(`Current Player: ${state.players[state.currentPlayerIndex].name}`);
  console.log(`Current Phase: ${state.phase}`);
}
