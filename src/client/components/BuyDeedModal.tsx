import { BOARD, PropertyTile, AirportTile, UtilityTile } from "../../data/board";
import { GameState, Action, Player } from "../../engine/types";
import { useDecisionSlot } from "../lib/decisionQueue";
import { tileChip } from "../lib/zones";
import Sheet from "./Sheet";

interface Props {
  engineState: GameState;
  mySessionId: string;
  onSendAction: (action: Action) => void;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

/**
 * The deed sheet (spec §2 L2 · mockup screen 5).
 *
 * Zone chip, price, and a rent ladder with the tier you'd actually collect
 * highlighted — so the decision is "is this worth ₦120k", not "what is this".
 * Not dismissible: declining is an explicit "send am to auction", because that
 * is a real move with real consequences, not a cancel.
 *
 * The place photo is deliberately absent — photography lands with the board
 * step, and first paint must stay image-free.
 */
export default function BuyDeedModal({ engineState, mySessionId, onSendAction }: Props) {
  const { phase, players, currentPlayerIndex, tiles } = engineState;
  const currentPlayer: Player | undefined = players[currentPlayerIndex];

  const isMyBuy =
    phase === "awaiting-buy-decision" && !!currentPlayer && currentPlayer.id === mySessionId;
  const tile = currentPlayer ? BOARD[currentPlayer.position] : undefined;
  const buyable = !!tile && "price" in tile;

  const { visible, waiting } = useDecisionSlot("buy-deed", isMyBuy && buyable);

  if (!isMyBuy || !currentPlayer || !tile || !buyable) return null;

  const price = tile.price;
  const canAfford = currentPlayer.cash >= price;
  const chip = tileChip(tile);

  // Would buying this complete the group? Then the tier that matters is the
  // doubled unimproved-set rent, not the base one.
  const completesSet =
    tile.type === "property"
      ? BOARD.filter(
          (bt): bt is PropertyTile =>
            bt.type === "property" && bt.group === (tile as PropertyTile).group,
        ).every((gt) => gt.pos === tile.pos || tiles?.[gt.pos]?.ownerId === currentPlayer.id)
      : false;

  const zoneLabel = chip.slug ? chip.slug.replace(/^\w/, (c) => c.toUpperCase()) : "";

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
      waiting={waiting}
      footer={
        <>
          <button
            className="v2-btn v2-btn-pri"
            onClick={() => onSendAction({ type: "BUY" })}
            disabled={!canAfford}
          >
            {canAfford ? `Buy for ${naira(price)}` : "You no get enough"}
          </button>
          <button
            className="v2-btn v2-btn-sec"
            onClick={() => onSendAction({ type: "DECLINE_BUY" })}
          >
            Send am to auction
          </button>
        </>
      }
    >
      <div className="v2-price-row">
        <b>{naira(price)}</b>
        <span className={canAfford ? undefined : "is-short"}>
          your cash: {naira(currentPlayer.cash)}
        </span>
      </div>

      {tile.type === "property" && (
        <>
          <div className="v2-rents">
            <div className={`v2-rent-row${completesSet ? "" : " is-hot"}`}>
              <span>Rent</span>
              <b>{naira((tile as PropertyTile).rent[0])}</b>
            </div>
            <div className={`v2-rent-row${completesSet ? " is-hot" : ""}`}>
              <span>With full {zoneLabel} set</span>
              <b>{naira((tile as PropertyTile).rent[0] * 2)}</b>
            </div>
            <div className="v2-rent-row">
              <span>1 Bungalow</span>
              <b>{naira((tile as PropertyTile).rent[1])}</b>
            </div>
            <div className="v2-rent-row">
              <span>Hotel</span>
              <b>{naira((tile as PropertyTile).rent[5])}</b>
            </div>
          </div>
          {completesSet && (
            <div className="v2-note v2-note-ok">
              This one completes your {zoneLabel} set — rent go double.
            </div>
          )}
          <div className="v2-sh-meta">
            Building {naira((tile as PropertyTile).houseCost)} · Mortgage{" "}
            {naira((tile as PropertyTile).mortgage)}
          </div>
        </>
      )}

      {tile.type === "airport" && (
        <div className="v2-rents">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="v2-rent-row">
              <span>{n} owned</span>
              <b>{naira((tile as AirportTile).rent[n - 1])}</b>
            </div>
          ))}
        </div>
      )}

      {tile.type === "utility" && (
        <div className="v2-rents">
          <div className="v2-rent-row">
            <span>1 owned</span>
            <b>Dice × {(tile as UtilityTile).multiplier[0]}</b>
          </div>
          <div className="v2-rent-row">
            <span>2 owned</span>
            <b>Dice × {(tile as UtilityTile).multiplier[1]}</b>
          </div>
        </div>
      )}
    </Sheet>
  );
}
