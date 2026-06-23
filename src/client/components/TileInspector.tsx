import { motion } from "framer-motion";
import { BOARD, PropertyTile, AirportTile, UtilityTile, TaxTile } from "../../data/board";
import { tokenEmoji } from "../../data/tokens";

interface TileInspectorProps {
  tilePos: number;
  engineState: any;
  roomState: any;
  onClose: () => void;
}

export default function TileInspector({ tilePos, engineState, roomState, onClose }: TileInspectorProps) {
  const tile = BOARD[tilePos];
  if (!tile) return null;

  const tileState = engineState?.tiles?.[tilePos];
  const players = engineState?.players || [];
  const lobbyPlayers = roomState?.lobbyPlayers || new Map();

  const owner = tileState?.ownerId ? players.find((p: any) => p.id === tileState.ownerId) : null;
  const ownerToken = owner ? tokenEmoji(lobbyPlayers.get(owner.id)?.tokenId) : null;

  const playersOnTile = players.filter((p: any) => p.position === tilePos && !p.bankrupt);

  const getDevelopmentName = (houses: number) => {
    switch (houses) {
      case 0: return "Vacant Land";
      case 1: return "Bungalow";
      case 2: return "Duplex";
      case 3: return "Mansion";
      case 4: return "Mini-Estate";
      case 5: return "Hotel";
      default: return "Unknown";
    }
  };

  // Color map for property groups
  const groupColorMap: Record<string, string> = {
    brown: "var(--color-brown)",
    lightblue: "var(--color-lightblue)",
    pink: "var(--color-pink)",
    orange: "var(--color-orange)",
    red: "var(--color-red)",
    yellow: "var(--color-yellow)",
    green: "var(--color-green)",
    darkblue: "var(--color-darkblue)",
  };

  const renderPropertyDeed = (t: PropertyTile) => {
    const groupColor = groupColorMap[t.group] || "#fff";
    const houses = tileState?.houses ?? 0;
    const isMortgaged = tileState?.mortgaged ?? false;

    // Check if owner has full group
    const groupTiles = BOARD.filter((bt): bt is PropertyTile => bt.type === "property" && bt.group === t.group);
    const ownsFullGroup = owner && groupTiles.every(gt => engineState?.tiles?.[gt.pos]?.ownerId === owner.id);

    return (
      <>
        <div className="deed-header" style={{ background: groupColor }}>
          <div className="deed-title">TITLE DEED</div>
          <div className="deed-name">{t.name}</div>
        </div>
        <div className="deed-body">
          <div className="deed-rent-list">
            <div className={`deed-rent-row base-rent ${houses === 0 ? "highlight" : ""}`}>
              <span>Rent (unimproved)</span>
              <span>₦{t.rent[0].toLocaleString()}</span>
            </div>
            {ownsFullGroup && houses === 0 && (
              <div style={{ fontSize: "0.7rem", color: "var(--color-naira)", fontStyle: "italic", padding: "0.15rem 0.25rem" }}>
                ↑ Doubled to ₦{(t.rent[0] * 2).toLocaleString()} (full group)
              </div>
            )}
            {["Bungalow", "Duplex", "Mansion", "Mini-Estate", "Hotel"].map((label, i) => (
              <div key={i} className={`deed-rent-row ${houses === i + 1 ? "highlight" : ""}`}>
                <span>With {label}</span>
                <span>₦{t.rent[i + 1].toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="deed-divider" />

          <div className="deed-cost-info">
            <div>Building Cost: <strong>₦{t.houseCost.toLocaleString()}</strong> each</div>
            <div>Mortgage Value: <strong>₦{t.mortgage.toLocaleString()}</strong></div>
            <div>Unmortgage Cost: <strong>₦{Math.round(t.mortgage * 1.1).toLocaleString()}</strong></div>
            <div>Purchase Price: <strong>₦{t.price.toLocaleString()}</strong></div>
          </div>

          {/* Color group info */}
          <div style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: groupColor, display: "inline-block" }} />
              <span style={{ textTransform: "capitalize" }}>{t.group} Group</span>
              {ownsFullGroup && <span style={{ color: "var(--color-naira)", fontWeight: "bold" }}>✓ Complete</span>}
            </div>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {groupTiles.map(gt => {
                const gts = engineState?.tiles?.[gt.pos];
                const isOwned = gts?.ownerId != null;
                return (
                  <span key={gt.pos} style={{
                    fontSize: "0.7rem",
                    padding: "1px 6px",
                    borderRadius: "3px",
                    background: gt.pos === tilePos ? "rgba(255,255,255,0.1)" : "transparent",
                    border: `1px solid ${isOwned ? groupColor : "rgba(255,255,255,0.1)"}`,
                    color: isOwned ? "#fff" : "var(--text-muted)",
                    fontWeight: gt.pos === tilePos ? "bold" : "normal",
                  }}>
                    {gt.name}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Current status */}
          <div className="deed-status-box">
            {owner ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "1.2rem" }}>{ownerToken}</span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Owned by {owner.name}</div>
                  {isMortgaged ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--color-danger)" }}>🔒 Mortgaged</div>
                  ) : houses > 0 ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--color-gold)" }}>
                      {getDevelopmentName(houses)} ({houses === 5 ? "MAX" : `${houses}/5`})
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Unimproved</div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "0.4rem" }}>
                🏷️ Available for purchase
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderAirportDeed = (t: AirportTile) => (
    <>
      <div className="deed-header generic">
        <div className="deed-title">✈️ AIRPORT</div>
        <div className="deed-name">{t.name}</div>
      </div>
      <div className="deed-body">
        <div className="deed-rent-list">
          {[1, 2, 3, 4].map(count => {
            const ownedCount = owner ? BOARD.filter(bt => bt.type === "airport" && engineState?.tiles?.[bt.pos]?.ownerId === owner.id).length : 0;
            return (
              <div key={count} className={`deed-rent-row ${ownedCount === count ? "highlight" : ""}`}>
                <span>{count} Airport{count > 1 ? "s" : ""} owned</span>
                <span>₦{t.rent[count - 1].toLocaleString()}</span>
              </div>
            );
          })}
        </div>
        <div className="deed-divider" />
        <div className="deed-cost-info">
          <div>Purchase Price: <strong>₦{t.price.toLocaleString()}</strong></div>
          <div>Mortgage Value: <strong>₦{t.mortgage.toLocaleString()}</strong></div>
        </div>
        {renderOwnerStatus()}
      </div>
    </>
  );

  const renderUtilityDeed = (t: UtilityTile) => {
    const icon = t.name.toLowerCase().includes("electric") || t.name.toLowerCase().includes("phcn") ? "⚡" : "📡";
    return (
      <>
        <div className="deed-header generic">
          <div className="deed-title">{icon} UTILITY</div>
          <div className="deed-name">{t.name}</div>
        </div>
        <div className="deed-body">
          <div className="deed-rent-list">
            <div className={`deed-rent-row ${owner && BOARD.filter(bt => bt.type === "utility" && engineState?.tiles?.[bt.pos]?.ownerId === owner.id).length === 1 ? "highlight" : ""}`}>
              <span>1 Utility owned</span>
              <span>Dice × {t.multiplier[0]}</span>
            </div>
            <div className={`deed-rent-row ${owner && BOARD.filter(bt => bt.type === "utility" && engineState?.tiles?.[bt.pos]?.ownerId === owner.id).length === 2 ? "highlight" : ""}`}>
              <span>2 Utilities owned</span>
              <span>Dice × {t.multiplier[1]}</span>
            </div>
          </div>
          <div className="deed-divider" />
          <div className="deed-cost-info">
            <div>Purchase Price: <strong>₦{t.price.toLocaleString()}</strong></div>
            <div>Mortgage Value: <strong>₦{t.mortgage.toLocaleString()}</strong></div>
          </div>
          {renderOwnerStatus()}
        </div>
      </>
    );
  };

  const renderSpecialDeed = () => {
    const iconMap: Record<string, string> = {
      go: "🚀", jail: "🔒", free: "🍲", gotojail: "👮",
      chance: "❓", esusu: "🤲", tax: "💰"
    };
    const descMap: Record<string, string> = {
      go: "Collect ₦200,000 salary each time you pass or land here.",
      jail: "Just visiting! Unless you're sent here by the law.",
      free: engineState?.settings?.freeParkingJackpot
        ? `Land here to collect the Bukka Pot (currently ₦${(engineState?.freeParkingPot ?? 0).toLocaleString()}).`
        : "Take a rest. Nothing happens here.",
      gotojail: "Go directly to Kirikiri Prison. Do not pass START. Do not collect ₦200,000.",
      chance: "Draw a Chance card — could be fortune or misfortune!",
      esusu: "Draw an Esusu (Community) card — communal savings and surprises.",
    };

    return (
      <>
        <div className="deed-header generic">
          <div className="deed-title">{iconMap[tile.type] || "📍"} {tile.type.toUpperCase()}</div>
          <div className="deed-name">{tile.name}</div>
        </div>
        <div className="deed-body">
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, textAlign: "center", padding: "0.5rem 0" }}>
            {tile.type === "tax"
              ? `Pay ₦${(tile as TaxTile).amount.toLocaleString()} to the bank${engineState?.settings?.freeParkingJackpot ? " (added to Bukka Pot)" : ""}.`
              : descMap[tile.type] || "A special board space."
            }
          </p>
        </div>
      </>
    );
  };

  const renderOwnerStatus = () => (
    <div className="deed-status-box">
      {owner ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: "1.2rem" }}>{ownerToken}</span>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Owned by {owner.name}</div>
            {tileState?.mortgaged && <div style={{ fontSize: "0.75rem", color: "var(--color-danger)" }}>🔒 Mortgaged</div>}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "0.4rem" }}>
          🏷️ Available for purchase
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      className="tile-inspector-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="deed-card glass-panel"
        initial={{ scale: 0.85, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="tile-inspector-close"
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>

        {tile.type === "property" && renderPropertyDeed(tile as PropertyTile)}
        {tile.type === "airport" && renderAirportDeed(tile as AirportTile)}
        {tile.type === "utility" && renderUtilityDeed(tile as UtilityTile)}
        {!["property", "airport", "utility"].includes(tile.type) && renderSpecialDeed()}

        {/* Players currently on this tile */}
        {playersOnTile.length > 0 && (
          <div style={{ padding: "0 1.25rem 1rem", fontSize: "0.8rem" }}>
            <div style={{ color: "var(--text-secondary)", marginBottom: "0.35rem" }}>Players here:</div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {playersOnTile.map((p: any) => (
                <span key={p.id} style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  padding: "2px 8px", background: "rgba(255,255,255,0.04)",
                  borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)"
                }}>
                  {tokenEmoji(lobbyPlayers.get(p.id)?.tokenId)} {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
