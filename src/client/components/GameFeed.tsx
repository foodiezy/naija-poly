import { useEffect, useRef } from "react";
import type { GameState } from "../../engine/types";

/**
 * The game feed, moved out of the board centre in B6 (spec §2: the centre
 * holds dice and whose turn, nothing else).
 *
 * On desktop this is the left rail's history. On a phone it does not render at
 * all — the ticker carries the newest line and the history sheet has the rest,
 * which is the whole reason the ticker exists.
 */

function logClass(line: string): string {
  if (
    line.includes("rolled") ||
    line.includes("START") ||
    line.includes("Prison") ||
    line.includes("escaped")
  ) {
    return "log-entry log-entry-system";
  }
  if (line.includes("bought")) return "log-entry log-entry-buy";
  if (line.includes("paid rent") || line.includes("paid ₦") || line.includes("tax")) {
    return "log-entry log-entry-rent";
  }
  return "log-entry";
}

export default function GameFeed({ engineState }: { engineState: GameState }) {
  const log = engineState.log ?? [];
  const endRef = useRef<HTMLDivElement>(null);

  // Pin to the newest line by scrolling the feed's OWN container. The old
  // board-centre feed used scrollIntoView(), which walks every scrollable
  // ancestor including the window, so each new line yanked the page down.
  useEffect(() => {
    const container = endRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [log.length]);

  return (
    <section className="v2-feed" aria-label="Game events">
      <h2 className="v2-feed-title">What don happen</h2>
      <div className="v2-feed-logs" role="log" aria-live="polite">
        {log.length === 0 && <p className="v2-feed-empty">Nothing don happen yet.</p>}
        {log.map((line, i) => (
          <div key={i} className={logClass(line)}>
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
