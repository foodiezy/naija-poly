import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import * as sound from "../utils/sound";
import { GameState, Player } from "../../engine/types";

export function useSoundEffects(engineState: GameState | null, mySessionId: string | null) {
  const [lastLogLength, setLastLogLength] = useState(0);

  // Trigger sound effects + toast notifications based on new game log entries
  useEffect(() => {
    if (engineState?.log && engineState.log.length > lastLogLength) {
      const newLogs = engineState.log.slice(lastLogLength);

      newLogs.forEach((logLine: string) => {
        if (logLine === "Game started.") {
          toast.success(" Game started! Let the hustle begin!", { toastId: "game-start", autoClose: 3000 });
          return;
        }

        // Sounds
        if (logLine.includes("rolled")) {
          sound.playRoll();
        } else if (logLine.includes("bought") || logLine.includes("passed START") || logLine.includes("collected the Mama Put Pot")) {
          sound.playCash();
        } else if (logLine.includes("paid ₦") || logLine.includes("lost ₦") || logLine.includes("tax")) {
          sound.playRentPay();
        } else if (logLine.includes("drew Chance") || logLine.includes("drew Hustle")) {
          sound.playDraw();
        } else if (logLine.includes("Kirikiri Prison")) {
          sound.playJail();
        } else if (logLine.includes("built a")) {
          sound.playBuild();
        }

        // "Your turn" notification: play chime + browser Notification
        if (mySessionId) {
          const myName = engineState.players?.find((p: Player) => p.id === mySessionId)?.name;
          if (myName && logLine.includes(`It is now ${myName}'s turn`)) {
            sound.playYourTurn();
            // Browser notification for tabbed-away players
            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              new Notification("Odogwu Empire", { body: "It's your turn! 🎲", icon: "🎲" });
            }
          }
        }

        // Toasts — only for events involving this player specifically
        if (mySessionId) {
          const myName = engineState.players?.find((p: Player) => p.id === mySessionId)?.name;

          if (myName) {
            if (logLine.startsWith(myName)) {
              // My action toasts
              if (logLine.includes("bought")) {
                const propMatch = logLine.match(/bought (.+) for ₦([\.\d,]+)/);
                if (propMatch) {
                  toast.success(`🏘️ You bought ${propMatch[1]} for ₦${propMatch[2]}!`, { autoClose: 3500 });
                }
              } else if (logLine.includes("drew Chance")) {
                const cardMatch = logLine.match(/Chance: "([^"]+)"/);
                if (cardMatch) toast.info(`🃏 Chance: ${cardMatch[1]}`, { autoClose: 5000 });
              } else if (logLine.includes("drew Hustle")) {
                const cardMatch = logLine.match(/Hustle: "([^"]+)"/);
                if (cardMatch) toast.info(`💼 Hustle: ${cardMatch[1]}`, { autoClose: 5000 });
              }
            } else {
              // Events caused by others that affect me
              if (logLine.includes(`to ${myName}`)) {
                if (logLine.includes("paid")) {
                  const rentMatch = logLine.match(/paid ₦([\.\d,]+) rent to/);
                  if (rentMatch) {
                    toast.success(`💸 You collected ₦${rentMatch[1]} rent!`, { autoClose: 3000 });
                  }
                }
              }
              // Notify when others go bankrupt
              if (logLine.includes("bankrupt")) {
                const nameMatch = logLine.match(/^(.+?) (?:has gone|is now) bankrupt/);
                if (nameMatch) {
                  toast(`💀 ${nameMatch[1]} has gone bankrupt!`, { autoClose: 4000 });
                }
              }
              // Game over
              if (logLine.includes("wins the game")) {
                const winnerMatch = logLine.match(/^(.+?) wins the game/);
                if (winnerMatch) {
                  if (winnerMatch[1] === myName) {
                    toast.success("🏆 YOU WIN! E no easy, but you rule Naija!", { autoClose: false, closeOnClick: false });
                  } else {
                    toast(`🏆 ${winnerMatch[1]} wins the game!`, { autoClose: 5000 });
                  }
                }
              }
            }
          }
        }
      });
      setLastLogLength(engineState.log.length);
    } else if (!engineState?.log) {
      setLastLogLength(0);
    }
  }, [engineState?.log, lastLogLength, mySessionId]);

  return { setLastLogLength };
}
