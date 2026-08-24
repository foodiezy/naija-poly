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
  onLeave: () => void;
  onHowToPlay: () => void;
}

export default function ShellTopBar({
  roomId,
  engineState,
  mySessionId,
  muted,
  onToggleMute,
  onCopyRoomCode,
  onOpenMenu,
  onLeave,
  onHowToPlay,
}: Props) {
  const me = engineState.players?.find((p: Player) => p.id === mySessionId);
  const playerCount =
    engineState.players?.filter((p: Player) => !p.bankrupt && !p.kicked).length ?? 0;
  const maxPlayers = 6;
  const potOn = !!engineState.settings?.freeParkingJackpot;
  const pot = engineState.freeParkingPot ?? 0;
  const blackout = engineState.blackout;

  return (
    <header className="v2-gtop">
      <button className="v2-gtop-brand" onClick={onOpenMenu} aria-label="Open game menu">
        <span className="v2-gtop-brand-mark" aria-hidden="true">
          👑
        </span>
        <span className="v2-gtop-brand-copy">
          <b>Odogwu Empire</b>
          <span>Buy the land. Become the Odogwu.</span>
        </span>
      </button>

      <div className="v2-gtop-center">
        <button
          className="v2-gtop-room"
          onClick={onCopyRoomCode}
          title="Copy the invite link"
          aria-label={`Room ${roomId} — copy the invite link`}
        >
          Room: {roomId}
        </button>

        <button
          className="v2-gtop-copy"
          onClick={onCopyRoomCode}
          title="Copy the invite link"
          aria-label="Copy invite link"
        >
          ⧉ Copy Invite
        </button>

        <span className="v2-gtop-players" aria-label={`${playerCount} of ${maxPlayers} players`}>
          👥 Players {playerCount} / {maxPlayers}
        </span>

        {potOn && pot > 0 && (
          <span className="v2-gtop-chip v2-gtop-chip-pot" title="Mama Put pot">
            🍲 {nairaShort(pot)}
          </span>
        )}

        {blackout && (
          <span
            className="v2-gtop-chip v2-gtop-chip-nepa"
            title="NEPA don take light — rent frozen"
          >
            ⚡ NEPA
          </span>
        )}
      </div>

      <div className="v2-gtop-meta">
        {me && (
          <span className="v2-gtop-cash" aria-label={`Your cash: ${naira(me.cash)}`}>
            {naira(me.cash)}
          </span>
        )}

        <button className="v2-gtop-leave" onClick={onLeave}>
          ↪ Leave Game
        </button>

        <button
          className="v2-gtop-icon v2-gtop-mute"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
        >
          {muted ? "🔇" : "🔊"}
        </button>

        <button className="v2-gtop-icon" onClick={onHowToPlay} aria-label="How to play">
          ?
        </button>

        <button className="v2-gtop-icon" onClick={onOpenMenu} aria-label="Settings">
          ⚙
        </button>

        <button className="v2-gtop-icon" onClick={onOpenMenu} aria-label="Profile">
          👤
        </button>
      </div>
    </header>
  );
}
