import { GameState, Player, Action } from "../../engine/types";
import { BOARD } from "../../data/board";
import { canSellHouseOn, canMortgageAt } from "../../engine/queries";
import { useDecisionSlot } from "../lib/decisionQueue";
import Sheet from "./Sheet";

interface Props {
  engineState: GameState;
  me: Player;
  // Rent owed to the ledger while short on cash (separate from negative cash).
  ledgerDebt?: number;
  onSendAction: (action: Action) => void;
  onClose: () => void;
  onOpenTrade: () => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

/**
 * Debt rescue (spec §2 L2 · top of the queue).
 *
 * Highest priority in the decision queue: while you are insolvent nothing else
 * you could be shown matters. Not scrim-dismissible — leaving is an explicit
 * "Later" button, so the sheet can never be tapped away by accident while the
 * turn clock runs.
 *
 * Only moves the engine will actually accept are listed: canSellHouseOn
 * enforces even-selling AND the hotel-downgrade house-supply rule;
 * canMortgageAt enforces the no-buildings-in-group rule. Listing illegal moves
 * here just produced error toasts on click.
 */
export default function DebtRescueModal({
  engineState,
  me,
  ledgerDebt = 0,
  onSendAction,
  onClose,
  onOpenTrade,
}: Props) {
  const { visible, waiting } = useDecisionSlot("debt-rescue", true);

  const sellableHouses: { pos: number; name: string; value: number }[] = [];
  const mortgageableProperties: { pos: number; name: string; value: number }[] = [];

  Object.entries(engineState.tiles).forEach(([posStr, ts]) => {
    if (ts.ownerId !== me.id) return;
    const pos = parseInt(posStr, 10);
    const tile = BOARD[pos];
    if (ts.houses > 0) {
      if (canSellHouseOn(engineState, me.id, pos) && "houseCost" in tile) {
        sellableHouses.push({ pos, name: tile.name, value: Math.floor(tile.houseCost / 2) });
      }
    } else if (canMortgageAt(engineState, me.id, pos) && "mortgage" in tile) {
      mortgageableProperties.push({ pos, name: tile.name, value: tile.mortgage });
    }
  });

  // Total shortfall shown at the top: overdrawn cash + any ledgered rent debt.
  const totalOwed = Math.max(0, -me.cash) + ledgerDebt;

  return (
    <Sheet
      level="decision"
      open={visible}
      title="You dey owe"
      maxWidth={560}
      waiting={waiting}
      footerLayout="lead"
      footer={
        <>
          <button
            className="v2-btn v2-btn-pri"
            onClick={() => {
              onClose();
              onOpenTrade();
            }}
          >
            Open trade
          </button>
          <button className="v2-btn v2-btn-sec" onClick={onClose}>
            Later
          </button>
          <button
            className="v2-btn v2-btn-sec v2-btn-danger"
            onClick={() => {
              if (window.confirm("Declare bankruptcy? You will lose everything."))
                onSendAction({ type: "DECLARE_BANKRUPT" });
            }}
          >
            Declare bankruptcy
          </button>
        </>
      }
    >
      <div className="v2-note v2-note-bad">
        You owe <b>{naira(totalOwed)}</b>. Raise the cash — sell, mortgage or trade — and e go
        settle by itself. If you no fit, na bankruptcy.
      </div>

      {sellableHouses.length > 0 && (
        <div className="v2-group">
          <h3 className="v2-group-h">Sell buildings — half price back</h3>
          {sellableHouses.map((h) => (
            <div className="v2-raise-row" key={`house-${h.pos}`}>
              <span>{h.name}</span>
              <button
                className="v2-btn v2-btn-pri v2-raise-btn"
                onClick={() => onSendAction({ type: "SELL_HOUSE", pos: h.pos })}
              >
                +{naira(h.value)}
              </button>
            </div>
          ))}
        </div>
      )}

      {mortgageableProperties.length > 0 && (
        <div className="v2-group">
          <h3 className="v2-group-h">Mortgage property</h3>
          {mortgageableProperties.map((p) => (
            <div className="v2-raise-row" key={`mort-${p.pos}`}>
              <span>{p.name}</span>
              <button
                className="v2-btn v2-btn-pri v2-raise-btn"
                onClick={() => onSendAction({ type: "MORTGAGE", pos: p.pos })}
              >
                +{naira(p.value)}
              </button>
            </div>
          ))}
        </div>
      )}

      {sellableHouses.length === 0 && mortgageableProperties.length === 0 && (
        <p className="v2-sh-lede">
          Nothing left to sell or mortgage. Try a trade — otherwise na bankruptcy.
        </p>
      )}
    </Sheet>
  );
}
