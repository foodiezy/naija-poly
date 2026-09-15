import { BOARD } from "../../data/board";
import { AuctionState, Player, Action } from "../../engine/types";
import { useDecisionSlot } from "../lib/decisionQueue";
import { tileChip } from "../lib/zones";
import Sheet from "./Sheet";
import { useEffect, useState } from "react";
import { tokenEmoji } from "../../data/tokens";
import type { RoomState } from "../../shared/room";
import { playAuctionPulse } from "../utils/sound";

interface Props {
  auction: AuctionState;
  roomState: RoomState | null;
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
  roomState,
  players,
  mySessionId,
  myCash,
  onSendAction,
}: Props) {
  const { visible, waiting } = useDecisionSlot("auction", true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    const update = () =>
      setSecondsLeft(
        Math.max(0, Math.ceil(((auction.deadline ?? Date.now()) - Date.now()) / 1000)),
      );
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [auction.deadline]);
  useEffect(() => {
    if (!visible || !auction.deadline) return;
    let timer: ReturnType<typeof setTimeout>;
    const pulse = () => {
      const remaining = auction.deadline! - Date.now();
      if (remaining <= 0) return;
      playAuctionPulse(remaining <= 3000);
      timer = setTimeout(pulse, remaining <= 3000 ? 350 : 800);
    };
    pulse();
    return () => clearTimeout(timer);
  }, [visible, auction.deadline]);

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
          <span className="v2-auc-holder">
            {auction.highestBidderId && (
              <span aria-hidden="true">
                {tokenEmoji(roomState?.lobbyPlayers?.get(auction.highestBidderId)?.tokenId)}{" "}
              </span>
            )}
            {holder}
          </span>
        </span>
      </div>

      <p className="v2-status" role="timer">
        {secondsLeft}s · {secondsLeft <= 3 ? "Going… going…" : "Place your bid!"}
      </p>
      <div className="v2-auction-players" aria-label="Auction players">
        {players
          .filter((p) => auction.participantIds.includes(p.id))
          .map((p) => (
            <span key={p.id} className="v2-status">
              <span aria-hidden="true">
                {tokenEmoji(roomState?.lobbyPlayers?.get(p.id)?.tokenId)}
              </span>{" "}
              {p.name}
              {auction.passedIds.includes(p.id)
                ? " · Passed"
                : auction.highestBidderId === p.id
                  ? " · Leading"
                  : " · Bidding"}
            </span>
          ))}
      </div>

      {iAmHighest && <div className="v2-status v2-status-win">You hold the top bid.</div>}
      {!iAmHighest && iPassed && <div className="v2-status">You don fold — just dey watch.</div>}
      {!iAmHighest && !iPassed && !iAmParticipant && (
        <div className="v2-status">You no dey this auction — just dey watch.</div>
      )}
    </Sheet>
  );
}
