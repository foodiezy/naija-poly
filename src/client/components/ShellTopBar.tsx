import type { GameState, Player } from "../../engine/types";
import { naira, nairaShort } from "../lib/primaryAction";

/**
 * Band 1 of the in-game shell (spec §2, 56px).
 *
 * menu · room chip · status chips · YOUR CASH · mute.
 *
 * Your cash is the largest thing in the bar on purpose: it is the number a
 * player checks most often, and in the old layout it lived in a sidebar that
 * fell below the fold on a phone. The Mama Put pot and the NEPA blackout used
 * to be banners inside the board centre — they are status, not board, so they
 * become chips here (spec §2 "In-game desktop", board centre is emptied).
 */

interface Props {
  roomId: string;
  engineState: GameState;
  mySessionId: string;
  muted: boolean;
  onToggleMute: () => void;
  onCopyRoomCode: () => void;
  onOpenMenu: () => void;
}

export default function ShellTopBar({
  roomId,
  engineState,
  mySessionId,
  muted,
  onToggleMute,
  onCopyRoomCode,
  onOpenMenu,
}: Props) {
  const me = engineState.players?.find((p: Player) => p.id === mySessionId);
  const potOn = !!engineState.settings?.freeParkingJackpot;
  const pot = engineState.freeParkingPot ?? 0;
  const blackout = engineState.blackout;

  return (
    <header className="v2-gtop">
      <button className="v2-gtop-icon" onClick={onOpenMenu} aria-label="Game menu">
        ≡
      </button>

      <button
        className="v2-gtop-room"
        onClick={onCopyRoomCode}
        title="Copy the invite link"
        aria-label={`Room ${roomId} — copy the invite link`}
      >
        {roomId}
      </button>

      {potOn && pot > 0 && (
        <span className="v2-gtop-chip v2-gtop-chip-pot" title="Mama Put pot">
          🍲 {nairaShort(pot)}
        </span>
      )}

      {blackout && (
        <span className="v2-gtop-chip v2-gtop-chip-nepa" title="NEPA don take light — rent frozen">
          ⚡ NEPA
        </span>
      )}

      {me && (
        <span className="v2-gtop-cash" aria-label={`Your cash: ${naira(me.cash)}`}>
          {naira(me.cash)}
        </span>
      )}

      <button
        className="v2-gtop-icon v2-gtop-mute"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </header>
  );
}
