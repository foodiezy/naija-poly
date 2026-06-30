import { useEffect, useRef } from "react";
import { GameState, Player } from "../../engine/types";
import { Room } from "colyseus.js";

export function useAutoEndTurn(
  engineState: GameState | null,
  room: Room | null,
  mySessionId: string | null,
  autoEndTurnEnabled: boolean
) {
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = null;
    }

    if (
      autoEndTurnEnabled &&
      engineState?.phase === "awaiting-end-turn" &&
      room &&
      mySessionId
    ) {
      const me = engineState.players?.find((p: Player) => p.id === mySessionId);
      const isMyTurn = engineState.players?.[engineState.currentPlayerIndex]?.id === mySessionId;
      if (isMyTurn && me && me.cash >= 0 && !me.bankrupt && !engineState.activeTrade) {
        autoEndTimerRef.current = setTimeout(() => {
          room.send("ACTION", { type: "END_TURN" });
        }, 2500);
      }
    }

    return () => {
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
      }
    };
  }, [autoEndTurnEnabled, engineState?.phase, engineState?.currentPlayerIndex, engineState?.activeTrade, room, mySessionId, engineState?.players]);

}
