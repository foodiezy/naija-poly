/**
 * Decision-sheet queue (redesign step B4a · spec §2 "Modal system").
 *
 * Five surfaces in this game can each demand a decision, and today more than
 * one can be on screen at the same time — on a 360px phone that is an
 * unrecoverable pile of overlapping cards. This module owns the single rule
 * that resolves the pile: highest priority wins, everybody else waits, and the
 * visible sheet advertises how many are queued behind it.
 *
 * Priority is "cost of getting it wrong, soonest":
 *   1. debt-rescue    — you are insolvent; nothing else matters until it's fixed
 *   2. auction        — server timer running, money leaves the room when it ends
 *   3. chaos          — server timer running
 *   4. trade-incoming — another human is waiting on you
 *   5. buy-deed       — declining just sends it to auction, so it yields
 *
 * Pure and dependency-free on purpose: the React binding lives in
 * decisionQueue.tsx, and this file is what the unit tests exercise.
 */

export type DecisionKind = "debt-rescue" | "auction" | "chaos" | "trade-incoming" | "buy-deed";

/** Most urgent first. Index in this array IS the priority. */
export const DECISION_PRIORITY: readonly DecisionKind[] = [
  "debt-rescue",
  "auction",
  "chaos",
  "trade-incoming",
  "buy-deed",
];

export interface QueueResult {
  /** The one decision sheet allowed on screen, or null when nothing is active. */
  visible: DecisionKind | null;
  /** How many other decisions are active and waiting their turn. */
  waiting: number;
}

/**
 * Resolve which decision surface renders. Unknown kinds are ignored rather
 * than thrown on: a stale registration must never blank the screen.
 */
export function pickDecision(active: Iterable<DecisionKind>): QueueResult {
  const seen = new Set<DecisionKind>();
  for (const kind of active) {
    if (DECISION_PRIORITY.includes(kind)) seen.add(kind);
  }
  const visible = DECISION_PRIORITY.find((k) => seen.has(k)) ?? null;
  return { visible, waiting: visible === null ? 0 : seen.size - 1 };
}

/** "1 waiting" / "2 waiting" — the header chip copy. Empty when nothing waits. */
export function waitingLabel(waiting: number): string {
  return waiting > 0 ? `${waiting} waiting` : "";
}
