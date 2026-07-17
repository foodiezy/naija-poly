import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BOARD, GENERATOR_COST, STOCKPILE_MULTIPLIER, type PropertyTile } from "../../data/board";
import { GameState, Action } from "../../engine/types";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

// Renders whichever Chaos-mode interactive decision is currently live (C1–C5)
// for the player who must choose, plus the standing "fuel a generator" option
// available to any owner in a blacked-out zone. The client only renders the
// choice and dispatches intent — every outcome is computed by the pure engine.
export default function ChaosDecisionPanel({ engineState, mySessionId, onSendAction }: Props) {
  const [now, setNow] = useState(Date.now());
  const { phase, players, tiles, blackout } = engineState;

  const pending =
    engineState.pendingBlackout ??
    engineState.pendingStockpile ??
    engineState.pendingFireSale ??
    engineState.pendingEfcc ??
    null;
  const deadline = pending?.deadline ?? null;

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [deadline]);

  const myCash = players.find((p) => p.id === mySessionId)?.cash ?? 0;

  // The standing generator option (C2): any owner of an un-mortgaged property in
  // the darkened zone may pay to keep collecting, whether or not it's their turn.
  const zone = blackout?.zone;
  const iOwnLitTileInZone =
    zone !== undefined &&
    BOARD.some(
      (t) =>
        t.type === "property" &&
        t.group === zone &&
        tiles[t.pos]?.ownerId === mySessionId &&
        !tiles[t.pos]?.mortgaged,
    );
  const iHaveGenerator = !!blackout?.generatorOwners?.includes(mySessionId);
  const showGenerator = iOwnLitTileInZone && !iHaveGenerator && phase !== "game-over";

  const nothingToShow =
    !showGenerator &&
    phase !== "awaiting-blackout-target" &&
    phase !== "awaiting-stockpile-choice" &&
    phase !== "awaiting-firesale-pick" &&
    phase !== "awaiting-efcc-choice";
  if (nothingToShow) return null;

  const secsLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const spectating = (
    <div className="action-status-indicator" style={{ fontSize: "0.75rem" }}>
      Waiting for the chaos decision…
    </div>
  );

  let body: React.ReactNode = null;
  let title = "CHAOS EVENT";

  // ---- C1: aim the blackout ------------------------------------------------
  if (phase === "awaiting-blackout-target" && engineState.pendingBlackout) {
    const p = engineState.pendingBlackout;
    title = "⚡ NEPA LOAD-SHEDDING";
    body =
      mySessionId === p.drawerId ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center" }}>
          {p.selectableZones.map((z) => (
            <button
              key={z}
              className="button-primary"
              onClick={() => onSendAction({ type: "CHOOSE_BLACKOUT_ZONE", zone: z })}
              style={{ fontSize: "0.7rem", padding: "0.4rem 0.6rem", borderRadius: "2px" }}
            >
              Darken {z}
            </button>
          ))}
        </div>
      ) : (
        spectating
      );
  }

  // ---- C3: stockpile fork --------------------------------------------------
  if (phase === "awaiting-stockpile-choice" && engineState.pendingStockpile) {
    const p = engineState.pendingStockpile;
    title = "⛽ FUEL QUEUE";
    body =
      mySessionId === p.playerId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <button
            className="button-primary"
            onClick={() => onSendAction({ type: "CHOOSE_STOCKPILE", mode: "now" })}
            style={{ fontSize: "0.72rem", padding: "0.4rem", borderRadius: "2px" }}
          >
            Collect {naira(p.amount)} now
          </button>
          <button
            className="button-secondary"
            onClick={() => onSendAction({ type: "CHOOSE_STOCKPILE", mode: "double" })}
            style={{ fontSize: "0.72rem", padding: "0.4rem", borderRadius: "2px" }}
          >
            Stockpile for {naira(p.amount * STOCKPILE_MULTIPLIER)} next round
          </button>
        </div>
      ) : (
        spectating
      );
  }

  // ---- C4: fire sale -------------------------------------------------------
  if (phase === "awaiting-firesale-pick" && engineState.pendingFireSale) {
    const p = engineState.pendingFireSale;
    title = "🏷️ GOVERNMENT FIRE SALE";
    const priceOf = (pos: number) => {
      const t = BOARD[pos];
      const list = "price" in t ? (t as PropertyTile).price : 0;
      return Math.floor((list * (100 - p.discountPct)) / 100);
    };
    body =
      mySessionId === p.drawerId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ maxHeight: "9rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {p.eligibleTiles.map((pos) => {
              const cost = priceOf(pos);
              const tooRich = myCash < cost;
              return (
                <button
                  key={pos}
                  className="button-primary"
                  disabled={tooRich}
                  title={tooRich ? "Not enough cash" : undefined}
                  onClick={() => onSendAction({ type: "CHOOSE_FIRESALE_TILE", pos })}
                  style={{ fontSize: "0.68rem", padding: "0.35rem", borderRadius: "2px" }}
                >
                  {BOARD[pos].name} — {naira(cost)}
                </button>
              );
            })}
          </div>
          <button
            className="button-secondary"
            onClick={() => onSendAction({ type: "DECLINE_FIRESALE" })}
            style={{ fontSize: "0.72rem", padding: "0.35rem", borderRadius: "2px" }}
          >
            Pass
          </button>
        </div>
      ) : (
        spectating
      );
  }

  // ---- C5: EFCC settlement -------------------------------------------------
  if (phase === "awaiting-efcc-choice" && engineState.pendingEfcc) {
    const p = engineState.pendingEfcc;
    const targetName = players.find((pl) => pl.id === p.targetId)?.name ?? "the richest player";
    title = "🕵🏾 EFCC SETTLEMENT";
    body =
      mySessionId === p.targetId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <button
            className="button-primary"
            onClick={() => onSendAction({ type: "EFCC_PAY_CASH" })}
            style={{ fontSize: "0.72rem", padding: "0.4rem", borderRadius: "2px" }}
          >
            Settle {naira(p.cashAmount)} cash
          </button>
          {p.surrenderableTiles.length > 0 && (
            <div style={{ maxHeight: "8rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {p.surrenderableTiles.map((pos) => (
                <button
                  key={pos}
                  className="button-secondary"
                  onClick={() => onSendAction({ type: "EFCC_SURRENDER", pos })}
                  style={{ fontSize: "0.68rem", padding: "0.35rem", borderRadius: "2px" }}
                >
                  Forfeit {BOARD[pos].name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="action-status-indicator" style={{ fontSize: "0.75rem" }}>
          EFCC dey investigate <strong>{targetName}</strong>…
        </div>
      );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: "hidden" }}
    >
      <div className="auction-panel" style={{ margin: "0.75rem", borderRadius: "2px" }}>
        {body && (
          <>
            <div
              className="auction-title"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
            >
              {title}
            </div>
            {secsLeft !== null && (
              <div
                className="auction-timer-secs"
                style={{ textAlign: "center", fontSize: "0.7rem" }}
              >
                {secsLeft > 0 ? `${secsLeft}s to decide` : "resolving…"}
              </div>
            )}
            <div style={{ marginTop: "0.5rem" }}>{body}</div>
          </>
        )}

        {showGenerator && (
          <div style={{ marginTop: body ? "0.6rem" : 0 }}>
            <div
              style={{
                textAlign: "center",
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                marginBottom: "0.3rem",
              }}
            >
              Your {zone} zone dey dark — fuel a generator to keep collecting rent.
            </div>
            <button
              className="button-primary"
              disabled={myCash < GENERATOR_COST}
              title={myCash < GENERATOR_COST ? "Not enough cash" : undefined}
              onClick={() => onSendAction({ type: "BUY_GENERATOR" })}
              style={{ width: "100%", fontSize: "0.72rem", padding: "0.4rem", borderRadius: "2px" }}
            >
              🔌 Fuel Generator ({naira(GENERATOR_COST)})
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
