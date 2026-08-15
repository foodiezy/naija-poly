import type { Action, GameState } from "../../engine/types";
import { buildPrimaryCtx, primaryAction } from "../lib/primaryAction";

/**
 * Band 5 of the in-game shell (spec §2, 72px + safe area).
 *
 * `⋯` · ONE full-width contextual primary · `💬`.
 *
 * The old UI scattered Roll / Buy / Auction / End Turn between the board centre
 * and a sidebar that dropped below the fold under 980px — on a phone the button
 * you needed was routinely off screen while a turn timer ran. Here there is
 * exactly one primary, it never moves, and it sits under the thumb. Which
 * action it is comes from `primaryAction()` (pure, unit-tested); this component
 * only renders it and maps it to an intent.
 */

interface Props {
  engineState: GameState;
  mySessionId: string;
  myTokenWalking: boolean;
  unreadChat: number;
  onSendAction: (action: Action) => void;
  onOpenActions: () => void;
  onShowResults: () => void;
}

export default function ActionBar({
  engineState,
  mySessionId,
  myTokenWalking,
  unreadChat,
  onSendAction,
  onOpenActions,
  onShowResults,
}: Props) {
  const action = primaryAction(buildPrimaryCtx(engineState, mySessionId, myTokenWalking));
  const canEndTurn = action.kind === "end-turn" && !action.disabled;

  const fire = () => {
    switch (action.kind) {
      case "roll":
        return onSendAction({ type: "ROLL" });
      case "buy":
        return onSendAction({ type: "BUY" });
      case "auction":
        return onSendAction({ type: "DECLINE_BUY" });
      case "end-turn":
        return onSendAction({ type: "END_TURN" });
      case "results":
        return onShowResults();
      // Settling a debt is a whole composer (sell, mortgage, trade your way
      // out), so the button opens the actions sheet that owns it.
      case "settle-debt":
        return onOpenActions();
      default:
        return undefined;
    }
  };

  return (
    <div className="v2-actbar">
      <button
        className="v2-act-icon v2-act-side v2-act-end"
        onClick={canEndTurn ? () => onSendAction({ type: "END_TURN" }) : onOpenActions}
        aria-label={canEndTurn ? "End turn" : "More actions"}
        data-inactive={canEndTurn ? undefined : ""}
      >
        ↩
        <span>End Turn</span>
      </button>

      <button
        className={`v2-act-main v2-act-${action.tone}`}
        onClick={fire}
        disabled={action.disabled}
        data-kind={action.kind}
      >
        {action.kind === "roll" ? "Roll Dice" : action.label}
      </button>

      <button
        className="v2-act-icon v2-act-side v2-act-trade"
        onClick={onOpenActions}
        aria-label="Open trade actions"
      >
        🤝
        <span>Trade</span>
        {unreadChat > 0 && <span className="v2-act-dot" aria-label={`${unreadChat} unread`} />}
      </button>
    </div>
  );
}
