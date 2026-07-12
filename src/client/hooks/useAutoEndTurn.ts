import { useEffect, useRef } from "react";
import { GameState, Player } from "../../engine/types";
import { Room } from "colyseus.js";
import { BOARD } from "../../data/board";
import { canBuildOn, canUnmortgageAt } from "../../engine/queries";

// Auto-end-turn waits this long after landing before sending END_TURN, so the
// player has a moment to read what happened.
const AUTO_END_DELAY_MS = 2500;

// True when the local player has actionable property management to do right
// now — they own a buildable monopoly, or they can redeem a mortgaged tile.
// In either case, auto-end must pause so they don't lose their build window
// to the 2.5-second timer.
function hasPendingPropertyAction(state: GameState, playerId: string): boolean {
  for (const tile of BOARD) {
    if (!("price" in tile)) continue;
    if (state.tiles[tile.pos]?.ownerId !== playerId) continue;
    if (canBuildOn(state, playerId, tile.pos)) return true;
    if (canUnmortgageAt(state, playerId, tile.pos)) return true;
  }
  return false;
}

export function useAutoEndTurn(
  engineState: GameState | null,
  room: Room | null,
  mySessionId: string | null,
  autoEndTurnEnabled: boolean,
) {
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = null;
    }

    if (autoEndTurnEnabled && engineState?.phase === "awaiting-end-turn" && room && mySessionId) {
      const me = engineState.players?.find((p: Player) => p.id === mySessionId);
      const isMyTurn = engineState.players?.[engineState.currentPlayerIndex]?.id === mySessionId;
      const hasPending = hasPendingPropertyAction(engineState, mySessionId);
      if (
        isMyTurn &&
        me &&
        me.cash >= 0 &&
        !me.bankrupt &&
        !engineState.activeTrade &&
        !hasPending
      ) {
        autoEndTimerRef.current = setTimeout(() => {
          room.send("ACTION", { type: "END_TURN" });
        }, AUTO_END_DELAY_MS);
      }
    }

    return () => {
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
      }
    };
  }, [
    autoEndTurnEnabled,
    engineState?.phase,
    engineState?.currentPlayerIndex,
    engineState?.activeTrade,
    engineState?.tiles,
    room,
    mySessionId,
    engineState?.players,
    engineState,
  ]);
}
