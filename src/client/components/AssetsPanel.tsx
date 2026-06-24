import { useState, useEffect } from "react";
import { Room } from "colyseus.js";
import { PropertyTile, Tile } from "../../data/board";
import { GameState, Player } from "../../engine/types";
import { ownedTiles, tileValue, netWorth, ownsFullGroup, developmentPips } from "../lib/holdings";

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

  // The local player's owned tiles + total net worth (cash + bank values).
  const myProperties = ownedTiles(tilesState, mySessionId);
  const totalNetWorth = netWorth(me?.cash ?? 0, tilesState, mySessionId);

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
        <strong>₦{totalNetWorth.toLocaleString()}</strong>
      </div>

      {/* Holdings list */}
      <div className="sidebar-properties-list assets-list">
        {myProperties.length === 0 ? (
          <div className="assets-empty">No properties yet — roll and buy land!</div>
        ) : (
          myProperties.map((tile: Tile) => {
            const isProp = tile.type === "property";
            const ts = tilesState[tile.pos];
            const pips = developmentPips(tile.pos, tilesState);
            const monopoly = ownsFullGroup(tile.pos, tilesState, mySessionId);
            return (
              <div key={tile.pos} className={`sidebar-prop-row ${monopoly ? "assets-monopoly" : ""}`}>
                <div className="sidebar-prop-left">
                  <span
                    className="sidebar-prop-dot"
                    style={{ background: isProp ? `var(--color-${(tile as PropertyTile).group})` : "var(--text-muted)" }}
                    title={monopoly ? "You own the full group" : undefined}
                  />
                  <span className="sidebar-prop-name">{tile.name}</span>
                  {pips && <span className="assets-prop-pips" title={`${ts?.houses === 5 ? "Hotel" : `${ts?.houses} house(s)`}`}>{pips}</span>}
                  {ts?.mortgaged && <span className="sidebar-prop-status status-mortgaged">Mortgaged</span>}
                </div>
                <span className="assets-prop-value">₦{tileValue(tile.pos, tilesState).toLocaleString()}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
