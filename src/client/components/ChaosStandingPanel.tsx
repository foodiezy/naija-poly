import { BOARD, GENERATOR_COST } from "../../data/board";
import { GameState, Action } from "../../engine/types";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

/**
 * The two chaos states that are NOT forced decisions, split out of
 * ChaosDecisionPanel in step B4a so they stay inline in the sidebar:
 *
 *   - the standing generator offer (C2), which has no deadline and can persist
 *     for several rounds — as a non-dismissible sheet it would trap the player;
 *   - the "someone else is deciding" notice, which is spectator information and
 *     must not put a scrim over the board on another player's turn.
 *
 * Still on legacy dark styling on purpose: it lives inside the not-yet-rebuilt
 * game shell (step B5), where light tokens would look broken.
 */
export default function ChaosStandingPanel({ engineState, mySessionId, onSendAction }: Props) {
  const { phase, players, tiles, blackout } = engineState;
  const myCash = players.find((p) => p.id === mySessionId)?.cash ?? 0;

  // Any owner of an un-mortgaged property in the darkened zone may pay to keep
  // collecting, whether or not it is their turn.
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

  // Mirrors ChaosDecisionPanel's gating exactly, so the two are complementary:
  // it owns the decision that is yours, this owns the one that isn't.
  const pendingBlackout = phase === "awaiting-blackout-target" ? engineState.pendingBlackout : null;
  const pendingStockpile =
    phase === "awaiting-stockpile-choice" ? engineState.pendingStockpile : null;
  const pendingFireSale = phase === "awaiting-firesale-pick" ? engineState.pendingFireSale : null;
  const pendingEfcc = phase === "awaiting-efcc-choice" ? engineState.pendingEfcc : null;

  const mine =
    (pendingBlackout && pendingBlackout.drawerId === mySessionId) ||
    (pendingStockpile && pendingStockpile.playerId === mySessionId) ||
    (pendingFireSale && pendingFireSale.drawerId === mySessionId) ||
    (pendingEfcc && pendingEfcc.targetId === mySessionId);
  // Someone else's chaos decision is running — say so, don't block the board.
  const showSpectating =
    !!(pendingBlackout || pendingStockpile || pendingFireSale || pendingEfcc) && !mine;

  if (!showGenerator && !showSpectating) return null;

  return (
    <div className="auction-panel chaos-standing-panel">
      {showSpectating && (
        <div className="action-status-indicator chaos-standing-note">
          Waiting for the chaos decision…
        </div>
      )}

      {showGenerator && (
        <div className="chaos-standing-gen">
          <div className="chaos-standing-note">
            Your {zone} zone dey dark — fuel a generator to keep collecting rent.
          </div>
          <button
            className="button-primary chaos-standing-btn"
            disabled={myCash < GENERATOR_COST}
            title={myCash < GENERATOR_COST ? "Not enough cash" : undefined}
            onClick={() => onSendAction({ type: "BUY_GENERATOR" })}
          >
            🔌 Fuel Generator ({naira(GENERATOR_COST)})
          </button>
        </div>
      )}
    </div>
  );
}
