import { motion } from "framer-motion";
import { GameState, Player, Action } from "../../engine/types";
import { BOARD, PropertyTile } from "../../data/board";
import { IconBankrupt, IconTrade, IconWarning } from "./icons";

interface Props {
  engineState: GameState;
  me: Player;
  onSendAction: (action: Action) => void;
  onClose: () => void;
  onOpenTrade: () => void;
}

export default function DebtRescueModal({ engineState, me, onSendAction, onClose, onOpenTrade }: Props) {
  // Find properties that can be mortgaged or houses that can be sold
  const sellableHouses: { pos: number; name: string; value: number }[] = [];
  const mortgageableProperties: { pos: number; name: string; value: number }[] = [];

  Object.entries(engineState.tiles).forEach(([posStr, ts]) => {
    if (ts.ownerId === me.id) {
      const pos = parseInt(posStr, 10);
      const tile = BOARD[pos];
      if (tile.type === "property" && ts.houses > 0) {
        // Can sell house. Value is half the cost.
        sellableHouses.push({
          pos,
          name: tile.name,
          value: tile.houseCost / 2,
        });
      } else if (!ts.mortgaged && "mortgage" in tile) {
        // Can be mortgaged if no houses are on any property in its color group
        let canMortgage = true;
        if (tile.type === "property") {
          const groupTiles = BOARD.filter((t) => t.type === "property" && t.group === (tile as PropertyTile).group);
          const hasHouses = groupTiles.some((t) => (engineState.tiles[t.pos]?.houses ?? 0) > 0);
          if (hasHouses) canMortgage = false;
        }
        if (canMortgage) {
          mortgageableProperties.push({
            pos,
            name: tile.name,
            value: tile.mortgage,
          });
        }
      }
    }
  });

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <motion.div
        className="modal-content"
        style={{ maxWidth: "500px", padding: "1.5rem", background: "var(--surface-2)", border: "1px solid var(--color-danger)" }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ color: "var(--color-danger)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", margin: "0 0 0.5rem 0" }}>
            <IconWarning size={24} /> Debt Rescue
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            You are in debt by <strong style={{ color: "var(--color-danger)" }}>₦{Math.abs(me.cash).toLocaleString()}</strong>. You must raise cash or declare bankruptcy!
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "60vh", overflowY: "auto" }}>
          
          {sellableHouses.length > 0 && (
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--color-naira)" }}>Sell Buildings (50% value)</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {sellableHouses.map((h) => (
                  <div key={`house-${h.pos}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{h.name}</span>
                    <button
                      className="button-primary"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => onSendAction({ type: "SELL_HOUSE", pos: h.pos })}
                    >
                      Sell +₦{h.value.toLocaleString()}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mortgageableProperties.length > 0 && (
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--color-gold)" }}>Mortgage Properties</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {mortgageableProperties.map((p) => (
                  <div key={`mort-${p.pos}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{p.name}</span>
                    <button
                      className="button-primary"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "var(--color-gold)", color: "#000" }}
                      onClick={() => onSendAction({ type: "MORTGAGE", pos: p.pos })}
                    >
                      Mortgage +₦{p.value.toLocaleString()}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "var(--radius-md)" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--color-blue)" }}>Propose Trade</h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.5rem 0" }}>Trade properties with other players for cash.</p>
            <button
              className="button-primary"
              style={{ width: "100%", background: "var(--color-blue)", display: "flex", justifyContent: "center", gap: "0.5rem" }}
              onClick={() => {
                onClose();
                onOpenTrade();
              }}
            >
              <IconTrade size={16} /> Open Trade Builder
            </button>
          </div>

        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
          <button className="button-primary" style={{ flex: 1, background: "var(--surface-3)", color: "var(--text-primary)" }} onClick={onClose}>
            Close
          </button>
          <button
            className="button-primary"
            style={{ flex: 1, background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", display: "flex", justifyContent: "center", gap: "0.5rem" }}
            onClick={() => { if (window.confirm("Declare bankruptcy? You will lose everything.")) onSendAction({ type: "DECLARE_BANKRUPT" }); }}
          >
            Declare Bankruptcy <IconBankrupt size={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
