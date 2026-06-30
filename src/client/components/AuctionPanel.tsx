import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BOARD } from "../../data/board";
import { AuctionState, Player, Action } from "../../engine/types";
import { IconAuction, IconTrophy } from "./icons";

interface Props {
  auction: AuctionState;
  players: Player[];
  mySessionId: string;
  myCash: number;
  onSendAction: (action: Action) => void;
}

export default function AuctionPanel({ auction, players, mySessionId, myCash, onSendAction }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!auction.deadline) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [auction.deadline]);

  const iPassed = auction.passedIds.includes(mySessionId);
  const iAmHighest = auction.highestBidderId === mySessionId;
  const iAmParticipant = auction.participantIds.includes(mySessionId);
  const canBid = iAmParticipant && !iPassed && !iAmHighest;

  const msLeft = auction.deadline ? Math.max(0, auction.deadline - now) : 0;
  const secsLeft = Math.ceil(msLeft / 1000);
  const timerPct = auction.deadline
    ? Math.max(0, Math.min(100, (msLeft / (auction.bidDurationMs || 12000)) * 100))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: "hidden" }}
    >
      <div className={`auction-panel ${secsLeft <= 3 && auction.deadline ? "auction-urgent" : ""}`} style={{ margin: "0.75rem", borderRadius: "2px" }}>
        <div className="auction-title" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
          <IconAuction size={20} /> LIVE AUCTION
        </div>
        <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          <strong>{BOARD[auction.tilePos].name}</strong>
        </div>

        {auction.deadline && (
          <div className="auction-timer">
            <div className="auction-timer-bar">
              <div className={`auction-timer-fill ${secsLeft <= 3 ? "urgent" : ""}`} style={{ width: `${timerPct}%` }} />
            </div>
            <div className={`auction-timer-secs ${secsLeft <= 3 ? "urgent" : ""}`}>
              {secsLeft > 0 ? `${secsLeft}s` : "GONE!"}
            </div>
          </div>
        )}

        <div className="auction-bid-hud">
          <span>Top: <strong style={{ color: "var(--color-naira)" }}>₦{auction.highestBid.toLocaleString()}</strong></span>
          <span>{auction.highestBidderId ? players.find((p) => p.id === auction.highestBidderId)?.name : "No bids"}</span>
        </div>

        {canBid ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div className="auction-increment-buttons">
              {auction.bidIncrements.map((inc: number) => {
                const total = auction.highestBid + inc;
                const tooRich = myCash < total;
                return (
                  <button
                    key={inc}
                    className="button-primary bid-increment-btn"
                    disabled={tooRich}
                    title={tooRich ? "Not enough cash" : `Bid ₦${total.toLocaleString()}`}
                    onClick={() => onSendAction({ type: "BID", amount: total })}
                    style={{ fontSize: "0.7rem", padding: "0.4rem 0.2rem", borderRadius: "2px" }}
                  >
                    ▲ ₦{inc.toLocaleString()}
                  </button>
                );
              })}
            </div>
            <button
              className="button-secondary"
              onClick={() => onSendAction({ type: "PASS_BID" })}
              style={{ fontSize: "0.75rem", padding: "0.35rem", borderRadius: "2px" }}
            >
              Pass
            </button>
          </div>
        ) : iAmHighest ? (
          <div className="action-status-indicator" style={{ color: "var(--color-naira)", fontWeight: "bold", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
            <IconTrophy size={16} /> You hold the top bid!
          </div>
        ) : iPassed ? (
          <div className="action-status-indicator" style={{ fontSize: "0.75rem" }}>You folded.</div>
        ) : (
          <div className="action-status-indicator" style={{ fontSize: "0.75rem" }}>Spectating…</div>
        )}
      </div>
    </motion.div>
  );
}
