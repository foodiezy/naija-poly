import type { ReactNode } from "react";
import { BOARD, STOCKPILE_MULTIPLIER, type PropertyTile } from "../../data/board";
import { GameState, Action } from "../../engine/types";
import { useDecisionSlot } from "../lib/decisionQueue";
import { zoneOfGroup } from "../lib/zones";
import Sheet from "./Sheet";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

/**
 * Chaos-mode interactive decisions C1/C3/C4/C5 (spec §2 L2).
 *
 * Promoted out of ControlPanel alongside the auction, and for the same reason:
 * these run on a server deadline and were rendering below the fold on phones.
 *
 * This sheet now covers ONLY the decision that belongs to *you*. The standing
 * generator offer and the "someone else is deciding" notice moved to
 * ChaosStandingPanel — neither is a forced choice, and neither belongs behind a
 * scrim that cannot be dismissed.
 *
 * Every dispatched action is unchanged: CHOOSE_BLACKOUT_ZONE, CHOOSE_STOCKPILE,
 * CHOOSE_FIRESALE_TILE, DECLINE_FIRESALE, EFCC_PAY_CASH, EFCC_SURRENDER.
 */
export default function ChaosDecisionPanel({ engineState, mySessionId, onSendAction }: Props) {
  const { phase, players } = engineState;
  const myCash = players.find((p) => p.id === mySessionId)?.cash ?? 0;

  const blackout = phase === "awaiting-blackout-target" ? engineState.pendingBlackout : null;
  const stockpile = phase === "awaiting-stockpile-choice" ? engineState.pendingStockpile : null;
  const fireSale = phase === "awaiting-firesale-pick" ? engineState.pendingFireSale : null;
  const efcc = phase === "awaiting-efcc-choice" ? engineState.pendingEfcc : null;

  const mine =
    (blackout && blackout.drawerId === mySessionId) ||
    (stockpile && stockpile.playerId === mySessionId) ||
    (fireSale && fireSale.drawerId === mySessionId) ||
    (efcc && efcc.targetId === mySessionId);

  const { visible, waiting } = useDecisionSlot("chaos", !!mine);

  if (!mine) return null;

  let title = "Chaos";
  let lede: ReactNode = null;
  let body: ReactNode = null;
  let footer: ReactNode = null;
  const deadline =
    blackout?.deadline ?? stockpile?.deadline ?? fireSale?.deadline ?? efcc?.deadline ?? null;

  // ---- C1: aim the blackout ------------------------------------------------
  if (blackout) {
    title = "NEPA don take light";
    lede = <>Pick one zone to plunge into darkness. Landlords there stop collecting rent.</>;
    body = (
      <div className="v2-stack">
        {blackout.selectableZones.map((z) => (
          <button
            key={z}
            className="v2-btn v2-btn-pri v2-btn-sm"
            onClick={() => onSendAction({ type: "CHOOSE_BLACKOUT_ZONE", zone: z })}
          >
            Darken {zoneOfGroup(z).label}
          </button>
        ))}
      </div>
    );
  }

  // ---- C3: stockpile fork --------------------------------------------------
  if (stockpile) {
    title = "Fuel queue";
    lede = <>Take the money now, or hold am make e double next round.</>;
    footer = (
      <>
        <button
          className="v2-btn v2-btn-pri"
          onClick={() => onSendAction({ type: "CHOOSE_STOCKPILE", mode: "now" })}
        >
          Collect {naira(stockpile.amount)} now
        </button>
        <button
          className="v2-btn v2-btn-sec"
          onClick={() => onSendAction({ type: "CHOOSE_STOCKPILE", mode: "double" })}
        >
          Stockpile for {naira(stockpile.amount * STOCKPILE_MULTIPLIER)} next round
        </button>
      </>
    );
  }

  // ---- C4: government fire sale --------------------------------------------
  if (fireSale) {
    const priceOf = (pos: number) => {
      const t = BOARD[pos];
      const list = "price" in t ? (t as PropertyTile).price : 0;
      return Math.floor((list * (100 - fireSale.discountPct)) / 100);
    };
    title = "Government fire sale";
    lede = (
      <>
        Everything na <b>{fireSale.discountPct}% off</b> — grab one before the window close.
      </>
    );
    body = (
      <div className="v2-stack v2-scroll-stack">
        {fireSale.eligibleTiles.map((pos) => {
          const cost = priceOf(pos);
          const tooRich = myCash < cost;
          return (
            <button
              key={pos}
              className="v2-btn v2-btn-pri v2-btn-sm v2-btn-wide"
              disabled={tooRich}
              title={tooRich ? "Not enough cash" : undefined}
              onClick={() => onSendAction({ type: "CHOOSE_FIRESALE_TILE", pos })}
            >
              <span>{BOARD[pos].name}</span>
              <span className="v2-tnum">{naira(cost)}</span>
            </button>
          );
        })}
      </div>
    );
    footer = (
      <button
        className="v2-btn v2-btn-sec"
        onClick={() => onSendAction({ type: "DECLINE_FIRESALE" })}
      >
        Pass, I no want
      </button>
    );
  }

  // ---- C5: EFCC settlement -------------------------------------------------
  if (efcc) {
    title = "EFCC dey your side";
    lede = <>Settle with cash, or forfeit one property. No third option.</>;
    body =
      efcc.surrenderableTiles.length > 0 ? (
        <div className="v2-stack v2-scroll-stack">
          <p className="v2-sh-meta">Or hand over one:</p>
          {efcc.surrenderableTiles.map((pos) => (
            <button
              key={pos}
              className="v2-btn v2-btn-sec v2-btn-sm v2-btn-wide"
              onClick={() => onSendAction({ type: "EFCC_SURRENDER", pos })}
            >
              <span>Forfeit {BOARD[pos].name}</span>
            </button>
          ))}
        </div>
      ) : null;
    footer = (
      <button className="v2-btn v2-btn-pri" onClick={() => onSendAction({ type: "EFCC_PAY_CASH" })}>
        Settle {naira(efcc.cashAmount)} cash
      </button>
    );
  }

  return (
    <Sheet
      level="decision"
      open={visible}
      title={title}
      maxWidth={420}
      deadline={deadline}
      waiting={waiting}
      footer={footer}
    >
      {lede && <p className="v2-sh-lede">{lede}</p>}
      {body}
    </Sheet>
  );
}
