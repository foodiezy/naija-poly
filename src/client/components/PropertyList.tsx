import { BOARD, AirportTile, PropertyTile, UtilityTile } from "../../data/board";
import type { Tile } from "../../data/board";
import { getDevelopmentName } from "../../engine/engine";
import { GameState, TileState } from "../../engine/types";

interface Props {
  engineState: GameState;
  mySessionId: string;
  // Click a holding to open its card, where upgrade/sell/mortgage live.
  onOpenTile?: (pos: number) => void;
}

function currentRent(
  tile: Tile,
  ts: TileState | undefined,
  engineState: GameState,
  ownerId: string,
): number | null {
  if (!ts || ts.mortgaged) return null;
  if (tile.type === "property") {
    const t = tile as PropertyTile;
    const groupTiles = BOARD.filter(
      (bt): bt is PropertyTile => bt.type === "property" && bt.group === t.group,
    );
    const ownsFullGroup = groupTiles.every(
      (gt) => engineState.tiles?.[gt.pos]?.ownerId === ownerId,
    );
    if (ts.houses === 0 && ownsFullGroup) return t.rent[0] * 2;
    return t.rent[ts.houses];
  }
  if (tile.type === "airport") {
    const t = tile as AirportTile;
    const ownedCount = BOARD.filter(
      (bt) => bt.type === "airport" && engineState.tiles?.[bt.pos]?.ownerId === ownerId,
    ).length;
    return t.rent[Math.max(0, ownedCount - 1)];
  }
  return null;
}

function colorVar(tile: Tile): string {
  if (tile.type === "property") return `var(--color-${(tile as PropertyTile).group})`;
  if (tile.type === "airport") return "#9ca3af";
  if (tile.type === "utility") return "#64748b";
  return "var(--text-muted)";
}

function tileSubLabel(tile: Tile): string {
  if (tile.type === "property")
    return (tile as PropertyTile).group.replace(/^\w/, (c) => c.toUpperCase());
  if (tile.type === "airport") return "Airport";
  if (tile.type === "utility") {
    const t = tile as UtilityTile;
    const n = t.name.toLowerCase();
    return n.includes("power") || n.includes("phcn") || n.includes("electric") || n.includes("nepa")
      ? "⚡ Utility"
      : "📡 Utility";
  }
  return "";
}

export default function PropertyList({ engineState, mySessionId, onOpenTile }: Props) {
  const { tiles } = engineState;

  const myProperties = BOARD.filter((tile: Tile) => {
    const ts = tiles[tile.pos];
    return ts && ts.ownerId === mySessionId;
  });

  return (
    <div
      className="sidebar-properties holdings-panel"
      style={{ padding: "0.75rem 0.85rem", flex: 1, overflowY: "auto" }}
    >
      <div className="holdings-header">
        <span>My Properties</span>
        <span className="holdings-count">{myProperties.length}</span>
      </div>

      {myProperties.length === 0 ? (
        <div className="holdings-empty">No properties yet — land on one to buy.</div>
      ) : (
        <div className="holdings-grid">
          {myProperties.map((tile: Tile) => {
            const ts = tiles[tile.pos];
            const isProp = tile.type === "property";
            const houses = ts?.houses ?? 0;
            const isHotel = houses === 5;
            const isMortgaged = ts?.mortgaged ?? false;
            const rentNow = currentRent(tile, ts, engineState, mySessionId);

            // Full-group ownership pip indicator (for property tiles)
            const ownsFullGroup =
              isProp &&
              BOARD.filter(
                (bt): bt is PropertyTile =>
                  bt.type === "property" && bt.group === (tile as PropertyTile).group,
              ).every((gt) => engineState.tiles?.[gt.pos]?.ownerId === mySessionId);

            return (
              <div
                key={tile.pos}
                className={`holdings-card holdings-card-clickable${isMortgaged ? " mortgaged" : ""}${ownsFullGroup ? " full-set" : ""}`}
                onClick={() => onOpenTile?.(tile.pos)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenTile?.(tile.pos);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${tile.name} — open card to upgrade, sell or mortgage`}
                title="Open card to upgrade, sell or mortgage"
              >
                <div className="holdings-band" style={{ background: colorVar(tile) }} />
                <div className="holdings-body">
                  <div className="holdings-top">
                    <div className="holdings-name-block">
                      <div className="holdings-name" title={tile.name}>
                        {tile.name}
                      </div>
                      <div className="holdings-sub">
                        {tileSubLabel(tile)}
                        {ownsFullGroup && <span className="holdings-set-pill">SET</span>}
                      </div>
                    </div>
                    {rentNow !== null && (
                      <div className="holdings-rent">
                        <span className="holdings-rent-label">Rent</span>
                        <span className="holdings-rent-value">₦{rentNow.toLocaleString()}</span>
                      </div>
                    )}
                    {isMortgaged && <div className="holdings-mortgage-badge">🔒 Mortgaged</div>}
                  </div>

                  {isProp && (
                    <div className="holdings-dev-row">
                      {isHotel ? (
                        <span className="dev-pip dev-hotel" title="Hotel">
                          🏨
                        </span>
                      ) : houses > 0 ? (
                        <>
                          {Array.from({ length: houses }).map((_, i) => (
                            <span
                              key={i}
                              className="dev-pip dev-house"
                              title={getDevelopmentName(houses)}
                            />
                          ))}
                          {Array.from({ length: 4 - houses }).map((_, i) => (
                            <span key={`e${i}`} className="dev-pip dev-empty" />
                          ))}
                        </>
                      ) : (
                        Array.from({ length: 4 }).map((_, i) => (
                          <span key={i} className="dev-pip dev-empty" />
                        ))
                      )}
                      <span className="holdings-dev-label">
                        {isHotel
                          ? "🏨 Hotel"
                          : houses > 0
                            ? `${getDevelopmentName(houses)} · ${houses}/4`
                            : "Unimproved (0/4)"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
