import { BOARD, PropertyTile } from "../../data/board";
import type { Tile } from "../../data/board";
import { TradeOffer, Player, Action, TileState } from "../../engine/types";
import { tokenEmoji } from "../../data/tokens";
import { tileValue } from "../lib/holdings";
import { mortgageTransferFee } from "../../engine/queries";
import { RoomState } from "../../shared/room";
import { counterOfferFrom } from "../lib/gameInteractions";
import { useDecisionSlot } from "../lib/decisionQueue";
import { zoneOfGroup } from "../lib/zones";
import Sheet from "./Sheet";

interface Props {
  activeTrade: TradeOffer;
  players: Player[];
  tiles: Record<number, TileState>;
  mySessionId: string;
  onSendAction: (action: Action) => void;
  liveState?: RoomState | undefined;
  onCounterOffer?: (reversedTrade: TradeOffer) => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

function zoneSlug(tile: Tile): string | undefined {
  return tile.type === "property" ? zoneOfGroup((tile as PropertyTile).group).slug : undefined;
}

/**
 * Incoming trade offer (spec §2 L2).
 *
 * Another human is sitting there waiting on you, so this is a decision sheet:
 * answer with Accept, Counter or Decline. Every RESPOND_TRADE / counter payload
 * is byte-for-byte what it was — only the container and the layout changed.
 */
export default function TradeOverlay({
  activeTrade,
  players,
  tiles,
  mySessionId,
  onSendAction,
  liveState,
  onCounterOffer,
}: Props) {
  const forMe = activeTrade.toId === mySessionId;
  const { visible, waiting } = useDecisionSlot("trade-incoming", forMe);

  if (!forMe) return null;

  const proposer = players.find((p) => p.id === activeTrade.fromId);
  const me = players.find((p) => p.id === mySessionId);
  const getToken = (id: string) => tokenEmoji(liveState?.lobbyPlayers?.get(id)?.tokenId);

  // From your POV: giveCash/giveTiles is what THEY are sending you; getCash/getTiles is what they want FROM you.
  const incomingCash = activeTrade.giveCash;
  const incomingTilesPositions = activeTrade.giveTiles;
  const outgoingCash = activeTrade.getCash;
  const outgoingTilesPositions = activeTrade.getTiles;
  const incomingJailCards = activeTrade.giveJailCards ?? 0;
  const outgoingJailCards = activeTrade.getJailCards ?? 0;

  // Receiving mortgaged property costs 10% interest to the bank on accept.
  const interestDue = mortgageTransferFee({ tiles }, incomingTilesPositions);

  const incomingValue =
    incomingCash + incomingTilesPositions.reduce((s, p) => s + tileValue(p, tiles), 0);
  const outgoingValue =
    outgoingCash + outgoingTilesPositions.reduce((s, p) => s + tileValue(p, tiles), 0);
  // Mirrors the engine's accept-time checks: cover the cash you send, and the
  // interest with your post-swap balance.
  const myCash = me?.cash ?? 0;
  const canAfford = myCash >= outgoingCash && myCash - outgoingCash + incomingCash >= interestDue;

  const tileList = (positions: number[]) =>
    positions.length === 0 ? (
      <li className="v2-trade-empty">No property</li>
    ) : (
      positions.map((pos) => (
        <li className="v2-trade-tile" key={pos} data-zone={zoneSlug(BOARD[pos])}>
          <i />
          <span>{BOARD[pos].name}</span>
        </li>
      ))
    );

  return (
    <Sheet
      level="decision"
      open={visible}
      title="Incoming deal"
      maxWidth={560}
      waiting={waiting}
      footerLayout={onCounterOffer ? "lead" : "split"}
      footer={
        <>
          <button
            className="v2-btn v2-btn-pri"
            disabled={!canAfford}
            onClick={() => onSendAction({ type: "RESPOND_TRADE", accept: true })}
          >
            Accept deal
          </button>
          {onCounterOffer && (
            <button
              className="v2-btn v2-btn-sec"
              onClick={() => onCounterOffer(counterOfferFrom(activeTrade, mySessionId))}
            >
              Counter
            </button>
          )}
          <button
            className="v2-btn v2-btn-sec"
            onClick={() => onSendAction({ type: "RESPOND_TRADE", accept: false })}
          >
            Decline
          </button>
        </>
      }
    >
      <div className="v2-trade-from">
        <span className="v2-trade-av">{getToken(activeTrade.fromId)}</span>
        <span>
          <b>{proposer?.name ?? "Somebody"}</b>
          <span>sent you a deal</span>
        </span>
      </div>

      <div className="v2-trade-ledger">
        <div className="v2-trade-col v2-trade-col-in">
          <h3 className="v2-trade-h">You collect</h3>
          <span className="v2-trade-cash">{naira(incomingCash)}</span>
          <ul className="v2-trade-tiles">{tileList(incomingTilesPositions)}</ul>
          {incomingJailCards > 0 && (
            <span className="v2-trade-empty">🎟️ ×{incomingJailCards} jail card</span>
          )}
        </div>

        <div className="v2-trade-col">
          <h3 className="v2-trade-h">You give</h3>
          <span className={`v2-trade-cash${canAfford ? "" : " is-short"}`}>
            {naira(outgoingCash)}
          </span>
          <ul className="v2-trade-tiles">{tileList(outgoingTilesPositions)}</ul>
          {outgoingJailCards > 0 && (
            <span className="v2-trade-empty">🎟️ ×{outgoingJailCards} jail card</span>
          )}
        </div>
      </div>

      <div className="v2-rents">
        <div className="v2-rent-row">
          <span>Value coming in</span>
          <b>{naira(incomingValue)}</b>
        </div>
        <div className="v2-rent-row">
          <span>Value going out</span>
          <b>{naira(outgoingValue)}</b>
        </div>
      </div>

      {interestDue > 0 && (
        <div className="v2-note v2-note-warn">
          Accepting costs an extra <b>{naira(interestDue)}</b> bank interest (10%) on the mortgaged
          property you dey collect.
        </div>
      )}

      {!canAfford && (
        <div className="v2-note v2-note-bad">
          You no fit cover the {naira(outgoingCash)} cash
          {interestDue > 0 ? ` plus ${naira(interestDue)} interest` : ""} — you get{" "}
          <b>{naira(myCash)}</b>.
        </div>
      )}
    </Sheet>
  );
}
