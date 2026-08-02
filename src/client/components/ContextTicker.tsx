import { useEffect, useRef, useState } from "react";
import type { GameState, Player } from "../../engine/types";
import { BOARD } from "../../data/board";
import { tileChip } from "../lib/zones";
import { naira } from "../lib/primaryAction";

/**
 * Band 4 of the in-game shell (spec §2, 36px).
 *
 * Answers "where am I and what just happened" in one line, so the board itself
 * can stop shouting: at 29px a tile shows a zone band and an owner chip, not a
 * name and a price. The resting state names the tile you're standing on; a new
 * feed line takes over for a few seconds and then hands the line back. Tapping
 * opens the full history (an L1 info sheet).
 */

/** How long a fresh feed line holds the ticker before it reverts. */
const FEED_HOLD_MS = 4200;

interface Props {
  engineState: GameState;
  mySessionId: string;
  onOpenLog: () => void;
}

export default function ContextTicker({ engineState, mySessionId, onOpenLog }: Props) {
  const log = engineState.log ?? [];
  const latest = log.length > 0 ? log[log.length - 1] : "";

  // Show the newest feed line briefly, then fall back to the tile readout.
  const [showFeed, setShowFeed] = useState(false);
  const seenRef = useRef(log.length);
  useEffect(() => {
    if (log.length === seenRef.current) return;
    seenRef.current = log.length;
    setShowFeed(true);
    const t = setTimeout(() => setShowFeed(false), FEED_HOLD_MS);
    return () => clearTimeout(t);
  }, [log.length]);

  const me = engineState.players?.find((p: Player) => p.id === mySessionId);
  const tile = me ? BOARD[me.position] : undefined;
  const chip = tile ? tileChip(tile) : { label: "", slug: null };

  let body: React.ReactNode;
  if (showFeed && latest) {
    body = <span className="v2-ticker-feed">{latest}</span>;
  } else if (tile) {
    const ts = engineState.tiles?.[tile.pos];
    const ownerName = ts?.ownerId
      ? (engineState.players?.find((p: Player) => p.id === ts.ownerId)?.name ?? "someone")
      : null;
    const status = !("price" in tile)
      ? null
      : ts?.ownerId === mySessionId
        ? "Yours"
        : ownerName
          ? `${ownerName}'s`
          : "Unowned";
    body = (
      <>
        You dey on <b>{tile.name}</b>
        {"price" in tile && <> · {naira(tile.price)}</>}
        {status && <> · {status}</>}
        {ts?.mortgaged && <> · mortgaged</>}
      </>
    );
  } else {
    body = <span className="v2-ticker-feed">{latest || "Game dey go…"}</span>;
  }

  return (
    <button
      className="v2-ticker"
      onClick={onOpenLog}
      aria-label="Open the game history"
      title="Tap for the full history"
    >
      <span
        className="v2-ticker-dot"
        aria-hidden="true"
        style={chip.slug ? { background: `var(--zone-${chip.slug}-bar)` } : undefined}
      />
      <span className="v2-ticker-body">{body}</span>
      <span className="v2-ticker-more" aria-hidden="true">
        ▲
      </span>
    </button>
  );
}
