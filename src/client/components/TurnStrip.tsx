import { useEffect, useRef } from "react";
import type { GameState, Player } from "../../engine/types";
import type { RoomState } from "../../shared/room";
import { tokenEmoji } from "../../data/tokens";
import { nairaShort } from "../lib/primaryAction";

/**
 * Band 2 of the in-game shell (spec §2, 44px).
 *
 * A horizontal rail of every player — token, name, cash — with the active
 * player ringed in coral and auto-scrolled into view. On a phone the full
 * player list is a sheet; this rail is the always-on answer to "whose turn is
 * it and who is beating me", which previously required scrolling to a sidebar.
 */

interface Props {
  engineState: GameState;
  roomState: RoomState | null;
  mySessionId: string;
}

export default function TurnStrip({ engineState, roomState, mySessionId }: Props) {
  const players = engineState.players ?? [];
  const activeId = players[engineState.currentPlayerIndex]?.id;
  const activeRef = useRef<HTMLLIElement | null>(null);

  // Keep whoever is playing on screen. `nearest` so a rail that already fits
  // never jumps, and inline-only so the page itself is never scrolled.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <nav className="v2-turnstrip" aria-label="Players">
      <ul className="v2-turnstrip-list">
        {players.map((p: Player) => {
          const isActive = p.id === activeId;
          const out = p.bankrupt || p.kicked;
          return (
            <li
              key={p.id}
              ref={isActive ? activeRef : undefined}
              className={`v2-tp${isActive ? " active" : ""}${out ? " out" : ""}`}
            >
              <span className="v2-tp-token" aria-hidden="true">
                {tokenEmoji(roomState?.lobbyPlayers?.get(p.id)?.tokenId)}
              </span>
              <span className="v2-tp-name">
                {p.name}
                {p.id === mySessionId ? " (you)" : ""}
              </span>
              <span className="v2-tp-cash">{out ? "out" : nairaShort(p.cash)}</span>
              {p.inJail && !out && (
                <span className="v2-tp-jail" title="In Kirikiri">
                  🔒
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
