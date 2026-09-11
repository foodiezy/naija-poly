import { useEffect, useRef } from "react";
import type { GameState } from "../../engine/types";
import { BOARD } from "../../data/board";

/** Compact board-centre history and public pending-trade details. */

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
  const trade = engineState.activeTrade;
  const playerName = (id: string) => engineState.players.find((p) => p.id === id)?.name ?? "Player";
  const assets = (cash: number, tiles: number[], cards = 0) =>
    [
      `₦${cash.toLocaleString()}`,
      ...tiles.map((pos) => BOARD[pos].name),
      ...(cards ? [`${cards} jail card(s)`] : []),
    ].join(" + ");
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
      {trade && (
        <details className="v2-pending-trade" key={JSON.stringify(trade)}>
          <summary>
            🤝 Proposed trade: {playerName(trade.fromId)} → {playerName(trade.toId)}
          </summary>
          <p>
            <b>{playerName(trade.fromId)} offers:</b>{" "}
            {assets(trade.giveCash, trade.giveTiles, trade.giveJailCards)}
          </p>
          <p>
            <b>{playerName(trade.toId)} gives:</b>{" "}
            {assets(trade.getCash, trade.getTiles, trade.getJailCards)}
          </p>
          <p>Waiting for {playerName(trade.toId)} to respond.</p>
        </details>
      )}
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
