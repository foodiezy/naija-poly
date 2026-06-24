import { useState, useEffect } from "react";
import { Room } from "colyseus.js";
import { BOARD, PropertyTile, Tile } from "../../data/board";
import { getDevelopmentName } from "../../engine/engine";
import { GameState, Player } from "../../engine/types";

interface AssetsPanelProps {
  room: Room;
  engineState: GameState;
  turnDeadline?: number;
  turnTimeoutSecs?: number;
}

// Left-column panel: a Round counter + per-turn countdown ("Round Timer") on
// top, then the local player's holdings with their cash value. Read-only —
// property management still lives in the right-hand ControlPanel.
export default function AssetsPanel({ room, engineState, turnDeadline, turnTimeoutSecs }: AssetsPanelProps) {
  const [now, setNow] = useState<number>(Date.now());

  const mySessionId = room.sessionId;
  const tilesState = engineState?.tiles || {};
  const me = (engineState?.players || []).find((p: Player) => p.id === mySessionId);

  // Tick once a second while a turn timer is live so the countdown updates.
  useEffect(() => {
    if (!turnDeadline || turnDeadline <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [turnDeadline]);

  const turnMsLeft = turnDeadline && turnDeadline > 0 ? Math.max(0, turnDeadline - now) : 0;
  const turnSecsLeft = Math.ceil(turnMsLeft / 1000);
  const turnPct = turnDeadline && turnDeadline > 0 && turnTimeoutSecs
    ? Math.max(0, Math.min(100, (turnMsLeft / (turnTimeoutSecs * 1000)) * 100))
    : 0;
  const timerActive = !!turnDeadline && turnDeadline > 0;
  const mmss = `${String(Math.floor(turnSecsLeft / 60)).padStart(2, "0")}:${String(turnSecsLeft % 60).padStart(2, "0")}`;

  // The local player's owned tiles, plus the bank value of each.
  const myProperties = BOARD.filter((tile: Tile) => tilesState[tile.pos]?.ownerId === mySessionId);
  const tileValue = (tile: Tile): number => {
    if (!("price" in tile)) return 0;
    const ts = tilesState[tile.pos];
    if (ts?.mortgaged) return tile.mortgage;
    let v = tile.price;
    if (tile.type === "property" && ts && ts.houses > 0) v += ts.houses * (tile as PropertyTile).houseCost;
    return v;
  };
  const propertyValue = myProperties.reduce((sum, t) => sum + tileValue(t), 0);
  const netWorth = (me?.cash ?? 0) + propertyValue;

  const statusOf = (tile: Tile): { text: string; cls: string } | null => {
    const ts = tilesState[tile.pos];
    if (!ts) return null;
    if (ts.mortgaged) return { text: "Mortgaged", cls: "status-mortgaged" };
    if (tile.type === "property" && ts.houses > 0) return { text: getDevelopmentName(ts.houses), cls: "status-house" };
    return null;
  };

  if (!engineState) return null;

  return (
    <div className="console-panel glass-panel assets-panel">
      <div className="assets-panel-header">
        <span>💼 My Assets</span>
        <span className="assets-round-badge">
          Round <strong>{engineState.currentTurn ?? 1}</strong>
          {engineState.settings?.turnLimit > 0 && (
            <span className="assets-round-limit">/ {engineState.settings.turnLimit}</span>
          )}
        </span>
      </div>

      {/* Round Timer — the per-turn AFK countdown, mirroring the mockup. */}
      <div className="assets-timer">
        <div className="assets-timer-row">
          <span>⏱️ Round Timer</span>
          <span className={`assets-timer-secs ${timerActive && turnSecsLeft <= 10 ? "urgent" : ""}`}>
            {timerActive ? mmss : "—"}
          </span>
        </div>
        <div className="assets-timer-track">
          <div
            className={`assets-timer-fill ${turnSecsLeft <= 10 ? "urgent" : ""}`}
            style={{ width: `${timerActive ? turnPct : 0}%` }}
          />
        </div>
      </div>

      {/* Net worth summary */}
      <div className="assets-total">
        <span>Net worth</span>
        <strong>₦{netWorth.toLocaleString()}</strong>
      </div>

      {/* Holdings list */}
      <div className="sidebar-properties-list assets-list">
        {myProperties.length === 0 ? (
          <div className="assets-empty">No properties yet — roll and buy land!</div>
        ) : (
          myProperties.map((tile: Tile) => {
            const isProp = tile.type === "property";
            const status = statusOf(tile);
            return (
              <div key={tile.pos} className="sidebar-prop-row">
                <div className="sidebar-prop-left">
                  <span
                    className="sidebar-prop-dot"
                    style={{ background: isProp ? `var(--color-${(tile as PropertyTile).group})` : "var(--text-muted)" }}
                  />
                  <span className="sidebar-prop-name">{tile.name}</span>
                  {status && <span className={`sidebar-prop-status ${status.cls}`}>{status.text}</span>}
                </div>
                <span className="assets-prop-value">₦{tileValue(tile).toLocaleString()}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
