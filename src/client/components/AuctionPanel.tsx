import { BOARD } from "../../data/board";
import { AuctionState, Player, Action } from "../../engine/types";
import { useDecisionSlot } from "../lib/decisionQueue";
import { tileChip } from "../lib/zones";
import Sheet from "./Sheet";

interface Props {
  auction: AuctionState;
  players: Player[];
  mySessionId: string;
  myCash: number;
  onSendAction: (action: Action) => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

/**
 * Live auction (spec §2 L2).
 *
 * Promoted out of ControlPanel in step B4a. It used to render inline in the
 * sidebar, which under 980px sits in grid row 2 *below the board* — so on a
 * phone the one timed decision in the game scrolled off-screen and players
 * lost properties to a clock they could not see.
 *
 * Every bid/pass message is unchanged: BID carries highestBid + increment,
 * passing sends PASS_BID. The countdown is now the sheet's coral header bar,
 * driven by CSS off auction.deadline, so nothing re-renders per tick.
 */
export default function AuctionPanel({
  auction,
  players,
  mySessionId,
  myCash,
  onSendAction,
}: Props) {
  const { visible, waiting } = useDecisionSlot("auction", true);

  const iPassed = auction.passedIds.includes(mySessionId);
  const iAmHighest = auction.highestBidderId === mySessionId;
  const iAmParticipant = auction.participantIds.includes(mySessionId);
  const canBid = iAmParticipant && !iPassed && !iAmHighest;

  const tile = BOARD[auction.tilePos];
  const chip = tileChip(tile);
  const holder = auction.highestBidderId
    ? (players.find((p) => p.id === auction.highestBidderId)?.name ?? "—")
    : "No bids yet";

  return (
    <Sheet
      level="decision"
      open={visible}
      title={tile.name}
      titleAdornment={
        chip.label ? (
          <span className="v2-zchip" data-zone={chip.slug ?? undefined}>
            {chip.label}
          </span>
        ) : null
      }
      maxWidth={420}
      deadline={auction.deadline}
      countdownMs={auction.bidDurationMs}
      waiting={waiting}
      footer={
        canBid ? (
          <>
            <div className="v2-bid-grid">
              {auction.bidIncrements.map((inc: number) => {
                const total = auction.highestBid + inc;
                const tooRich = myCash < total;
                return (
                  <button
                    key={inc}
                    className="v2-btn v2-btn-pri v2-bid"
                    disabled={tooRich}
                    title={tooRich ? "Not enough cash" : `Bid ${naira(total)}`}
                    onClick={() => onSendAction({ type: "BID", amount: total })}
                  >
                    <em>+{naira(inc)}</em>
                    <b>{naira(total)}</b>
                  </button>
                );
              })}
            </div>
            <button
              className="v2-btn v2-btn-sec"
              onClick={() => onSendAction({ type: "PASS_BID" })}
            >
              I pass
            </button>
          </>
        ) : null
      }
    >
      <p className="v2-sh-lede">Auction dey live — highest bidder pay the bank.</p>

      <div className="v2-auc-hud">
        <span>
          <span className="v2-auc-label">Top bid</span>
          <span className="v2-auc-top">{naira(auction.highestBid)}</span>
        </span>
        <span>
          <span className="v2-auc-label">Leading</span>
          <span className="v2-auc-holder">{holder}</span>
        </span>
      </div>

      {iAmHighest && <div className="v2-status v2-status-win">You hold the top bid.</div>}
      {!iAmHighest && iPassed && <div className="v2-status">You don fold — just dey watch.</div>}
      {!iAmHighest && !iPassed && !iAmParticipant && (
        <div className="v2-status">You no dey this auction — just dey watch.</div>
      )}
    </Sheet>
  );
}
