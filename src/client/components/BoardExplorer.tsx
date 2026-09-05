import { useId, useState, type CSSProperties } from "react";
import { BOARD } from "../../data/board";
import { tokenEmoji } from "../../data/tokens";
import type { GameState } from "../../engine/types";
import type { RoomState } from "../../shared/room";
import { zoneOfGroup } from "../lib/zones";
import "./board-explorer.css";

export type BoardFocus = { playerId: string } | "unowned" | null;

interface Props {
  state: GameState;
  roomState: RoomState | null;
  mySessionId?: string;
  focus: BoardFocus;
  onFocus: (focus: BoardFocus) => void;
  onTileClick?: (pos: number) => void;
  onShowBoard: () => void;
  displayedPositions: Map<string, number>;
}

const ownables = BOARD.filter((tile) => "price" in tile);
const groups = Array.from(
  new Set(ownables.map((tile) => (tile.type === "property" ? tile.group : tile.type))),
).map((key) => {
  const tiles = ownables.filter((tile) =>
    tile.type === "property" ? tile.group === key : tile.type === key,
  );
  const first = tiles[0];
  const zone = first.type === "property" ? zoneOfGroup(first.group) : null;
  return {
    key,
    tiles,
    label: zone?.label ?? (key === "airport" ? "Airports" : "Utilities"),
    color: zone ? `var(--zone-${zone.slug}-bar)` : "var(--ink-3)",
  };
});

/** A read-only view of synced ownership. Opening a deed uses the existing inspector. */
export default function BoardExplorer({
  state,
  roomState,
  mySessionId,
  focus,
  onFocus,
  onTileClick,
  onShowBoard,
  displayedPositions,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const selected =
    focus && focus !== "unowned"
      ? state.players.find((player) => player.id === focus.playerId)
      : undefined;
  const matches = (pos: number) => {
    const owner = state.tiles[pos]?.ownerId ?? null;
    return focus === "unowned" ? owner === null : selected ? owner === selected.id : true;
  };
  const holdings = ownables.filter((tile) => matches(tile.pos));
  const location = selected
    ? BOARD.find((tile) => tile.pos === (displayedPositions.get(selected.id) ?? selected.position))
    : undefined;
  const token = (id: string) => tokenEmoji(roomState?.lobbyPlayers.get(id)?.tokenId);

  return (
    <section className="board-explorer" aria-label="Board explorer">
      <button
        type="button"
        className="board-explorer-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
          if (open) onFocus(null);
        }}
      >
        <span>
          <b>Who owns what?</b>
          <small>Find players · spot complete sets · inspect deeds</small>
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={panelId} className="board-explorer-content">
          <div className="board-explorer-filters" role="group" aria-label="Highlight ownership">
            <button type="button" aria-pressed={focus === null} onClick={() => onFocus(null)}>
              Everyone
            </button>
            <button
              type="button"
              aria-pressed={focus === "unowned"}
              onClick={() => onFocus("unowned")}
            >
              Unowned
            </button>
            {state.players.map((player) => (
              <button
                key={player.id}
                type="button"
                aria-pressed={selected?.id === player.id}
                onClick={() => onFocus({ playerId: player.id })}
              >
                <span aria-hidden="true">{token(player.id)}</span>{" "}
                {player.id === mySessionId ? "You" : player.name}
                {player.bankrupt ? " · out" : ""}
              </button>
            ))}
          </div>
          <div className="board-explorer-summary" role="status">
            <b>
              {selected
                ? `${selected.name} · ${holdings.length} owned`
                : focus === "unowned"
                  ? `${holdings.length} unowned locations`
                  : "Every location. Every owner."}
            </b>
            <span>
              {selected
                ? selected.bankrupt
                  ? "Out of the game"
                  : `${selected.inJail ? "In Kirikiri" : `At ${location?.name ?? "the board"}`} · ₦${selected.cash.toLocaleString()} cash`
                : "Tap a location to open its deed. Outlined tiles match your selection."}
            </span>
          </div>
          {focus !== null && (
            <button type="button" className="board-explorer-jump" onClick={onShowBoard}>
              Show highlighted tiles ↓
            </button>
          )}
          {holdings.length === 0 && (
            <p className="board-explorer-empty">
              {selected
                ? "No properties yet. Their position is highlighted on the board."
                : "Every location has an owner. Select a player to explore their empire."}
            </p>
          )}
          <div className="board-explorer-groups">
            {groups
              .filter((group) => group.tiles.some((tile) => matches(tile.pos)))
              .map((group) => {
                const count = group.tiles.filter((tile) => matches(tile.pos)).length;
                return (
                  <section
                    key={group.key}
                    className="board-explorer-group"
                    style={{ "--explorer-zone": group.color } as CSSProperties}
                  >
                    <header>
                      <b>{group.label}</b>
                      <span>
                        {selected
                          ? count === group.tiles.length
                            ? "Set owned ✓"
                            : `${count}/${group.tiles.length} owned`
                          : focus === "unowned"
                            ? `${count} available`
                            : `${group.tiles.length} locations`}
                      </span>
                    </header>
                    <div className="board-explorer-deeds">
                      {group.tiles.map((tile) => {
                        const tileState = state.tiles[tile.pos];
                        const owner = state.players.find(
                          (player) => player.id === tileState?.ownerId,
                        );
                        return (
                          <button
                            key={tile.pos}
                            type="button"
                            data-match={focus !== null && matches(tile.pos) ? "true" : undefined}
                            onClick={() => onTileClick?.(tile.pos)}
                            disabled={!onTileClick}
                            aria-label={`${tile.name}, ${owner ? `owned by ${owner.name}` : "unowned"}${tileState?.mortgaged ? ", mortgaged" : ""}. Open deed`}
                          >
                            <b>{tile.name}</b>
                            <span>
                              {owner
                                ? `${token(owner.id)} ${owner.id === mySessionId ? "You" : owner.name}`
                                : "Unowned"}
                            </span>
                            {tileState?.mortgaged && <small>Mortgaged</small>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}
