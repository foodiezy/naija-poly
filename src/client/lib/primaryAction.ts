/**
 * The single contextual primary action (redesign step B5 · spec §2
 * "In-game mobile 360px", band 5).
 *
 * The old shell scattered Roll / Buy / Auction / End Turn across the board
 * centre and a sidebar that fell below the fold on a phone. v2 promises exactly
 * ONE full-width button under the thumb that is always the most important thing
 * you can do right now. This module owns that choice, and nothing else — it is
 * pure so the ordering can be unit-tested without a DOM or a socket.
 *
 * Precedence is "what costs you most if you miss it":
 *   1. game over        — the result is the only thing left
 *   2. you're out       — bankrupt/kicked players spectate
 *   3. you owe money    — insolvency blocks everything else
 *   4. a timed sheet    — auction or a chaos decision aimed at you owns the
 *                         screen already; the bar must not compete with it
 *   5. not your turn    — name whose turn it is instead of a dead button
 *   6. your turn        — roll → buy/auction → end turn
 */

import { BOARD } from "../../data/board";
import type { GameState, Phase, Player } from "../../engine/types";

export type PrimaryKind =
  | "results"
  | "spectating"
  | "settle-debt"
  | "hold"
  | "waiting"
  | "roll"
  | "buy"
  | "auction"
  | "end-turn";

export interface PrimaryAction {
  kind: PrimaryKind;
  /** Button label. Already Pidgin-toned; render as-is. */
  label: string;
  /** True when the button is a status readout rather than a control. */
  disabled: boolean;
  /** Drives the button's colour class. */
  tone: "primary" | "danger" | "quiet";
}

export interface PrimaryCtx {
  phase: Phase;
  isMyTurn: boolean;
  /** Undefined when the local player isn't in the player list (spectator). */
  me: Player | undefined;
  /** Name of whoever's turn it is, for the "waiting" readout. */
  activePlayerName: string;
  /** True while the roll presentation or my piece movement is still in progress. */
  tokenWalking: boolean;
  /** Cash shortfall plus outstanding ledger debt. */
  debt: number;
  /** True when a chaos decision is aimed at ME (its sheet is up). */
  chaosPending: boolean;
  /** List price of the tile I'm being asked to buy, or null. */
  landedPrice: number | null;
  /** Short name of that tile, for "Buy Ilorin · ₦120k". */
  landedName: string | null;
}

/** "₦1,240,000" — full precision, for cash readouts. */
export function naira(n: number): string {
  return `₦${Math.round(n).toLocaleString()}`;
}

/** "₦1.2M" / "₦120k" — for buttons and chips where width is scarce. */
export function nairaShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    return `₦${(Math.round(m * 10) / 10).toString()}M`;
  }
  if (abs >= 1_000) return `₦${Math.round(n / 1000)}k`;
  return `₦${Math.round(n)}`;
}

/** The chaos phases that pause play for one player's answer. */
const CHAOS_PHASES: readonly Phase[] = [
  "awaiting-blackout-target",
  "awaiting-stockpile-choice",
  "awaiting-firesale-pick",
  "awaiting-efcc-choice",
];

export function primaryAction(ctx: PrimaryCtx): PrimaryAction {
  const { phase, isMyTurn, me } = ctx;

  if (phase === "game-over") {
    return { kind: "results", label: "See who be Odogwu", disabled: false, tone: "primary" };
  }

  if (!me || me.bankrupt || me.kicked) {
    return {
      kind: "spectating",
      label: "You don comot — dey watch",
      disabled: true,
      tone: "quiet",
    };
  }

  if (ctx.debt > 0) {
    return {
      kind: "settle-debt",
      label: `Settle ${nairaShort(ctx.debt)} debt`,
      disabled: false,
      tone: "danger",
    };
  }

  // A timed sheet already owns the screen. The bar stays honest but inert so a
  // stray thumb can't fire a turn action underneath an auction.
  if (phase === "auction") {
    return { kind: "hold", label: "Auction dey run…", disabled: true, tone: "quiet" };
  }
  if (ctx.chaosPending) {
    return { kind: "hold", label: "Answer the card…", disabled: true, tone: "quiet" };
  }
  if (CHAOS_PHASES.includes(phase)) {
    return { kind: "hold", label: "Chaos dey resolve…", disabled: true, tone: "quiet" };
  }

  if (!isMyTurn) {
    return {
      kind: "waiting",
      label: `${ctx.activePlayerName || "Somebody"} dey play…`,
      disabled: true,
      tone: "quiet",
    };
  }

  if (ctx.tokenWalking) {
    return { kind: "hold", label: "Dice dey roll…", disabled: true, tone: "quiet" };
  }

  if (phase === "awaiting-roll") {
    return {
      kind: "roll",
      label: me.inJail ? "Roll to comot jail" : "Roll the dice",
      disabled: false,
      tone: "primary",
    };
  }

  if (phase === "awaiting-buy-decision") {
    const price = ctx.landedPrice ?? 0;
    if (price > 0 && me.cash >= price) {
      const name = ctx.landedName ? `${ctx.landedName} · ` : "";
      return {
        kind: "buy",
        label: `Buy ${name}${nairaShort(price)}`,
        disabled: false,
        tone: "primary",
      };
    }
    // Can't afford it — the only move left is to push it to the room.
    return { kind: "auction", label: "Send am go auction", disabled: false, tone: "primary" };
  }

  if (phase === "awaiting-end-turn") {
    return { kind: "end-turn", label: "End turn", disabled: false, tone: "primary" };
  }

  // "resolving" and anything else transient.
  return { kind: "hold", label: "Hold on small…", disabled: true, tone: "quiet" };
}

/**
 * Derive the context from live game state. Kept separate from the decision so
 * the decision stays trivially testable with hand-written contexts.
 */
export function buildPrimaryCtx(
  engineState: GameState,
  mySessionId: string,
  tokenWalking: boolean,
): PrimaryCtx {
  const players = engineState.players ?? [];
  const me = players.find((p) => p.id === mySessionId);
  const active = players[engineState.currentPlayerIndex];

  const ledgerDebt = (engineState.debtLedger ?? [])
    .filter((d) => d.debtorId === mySessionId)
    .reduce((sum, d) => sum + d.amount, 0);
  const debt = me && !me.bankrupt ? Math.max(0, -me.cash) + ledgerDebt : 0;

  const chaosPending =
    engineState.pendingBlackout?.drawerId === mySessionId ||
    engineState.pendingStockpile?.playerId === mySessionId ||
    engineState.pendingFireSale?.drawerId === mySessionId ||
    engineState.pendingEfcc?.targetId === mySessionId;

  let landedPrice: number | null = null;
  let landedName: string | null = null;
  if (engineState.phase === "awaiting-buy-decision" && me) {
    const tile = BOARD[me.position];
    if (tile && "price" in tile) {
      landedPrice = tile.price;
      landedName = tile.shortName ?? tile.name;
    }
  }

  return {
    phase: engineState.phase,
    isMyTurn: active?.id === mySessionId,
    me,
    activePlayerName: active?.name ?? "",
    tokenWalking,
    debt,
    chaosPending: !!chaosPending,
    landedPrice,
    landedName,
  };
}
