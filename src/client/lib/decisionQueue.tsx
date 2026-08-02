import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { pickDecision, type DecisionKind } from "./sheetQueue";

/**
 * React binding for the decision-sheet queue (spec §2).
 *
 * The five decision surfaces do not live in one place in the tree — buy-deed,
 * auction and chaos render at the App level, while the incoming trade and debt
 * rescue render from inside ControlPanel. A context lets each one declare "I
 * want the screen" from wherever it sits, and lets the queue answer "not yet".
 *
 * Each surface calls useDecisionSlot(kind, wants) and renders only when it gets
 * `visible: true`. The winner also receives `waiting`, the number of decisions
 * queued behind it, for the header chip.
 */

interface QueueApi {
  active: readonly DecisionKind[];
  setActive: (kind: DecisionKind, wants: boolean) => void;
}

// No provider (preview harness, tests, storybook-ish usage): every surface
// renders as it always did. Failing open beats blanking the screen.
const FALLBACK: QueueApi = { active: [], setActive: () => {} };

const DecisionQueueContext = createContext<QueueApi | null>(null);

export function DecisionQueueProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Partial<Record<DecisionKind, boolean>>>({});

  const setActive = useCallback((kind: DecisionKind, wants: boolean) => {
    setFlags((prev) => (!!prev[kind] === wants ? prev : { ...prev, [kind]: wants }));
  }, []);

  const active = useMemo(
    () => (Object.keys(flags) as DecisionKind[]).filter((k) => flags[k]),
    [flags],
  );

  const value = useMemo<QueueApi>(() => ({ active, setActive }), [active, setActive]);

  return <DecisionQueueContext.Provider value={value}>{children}</DecisionQueueContext.Provider>;
}

export interface DecisionSlot {
  /** True when this surface is the one allowed on screen right now. */
  visible: boolean;
  /** Other decisions queued behind this one — drives the "N waiting" chip. */
  waiting: number;
}

/**
 * Claim a place in the decision queue.
 *
 * `wants` must be computed unconditionally by the caller (hooks can't sit
 * behind an early return), so every decision surface now does its "should I
 * exist?" maths first and asks the queue second.
 */
export function useDecisionSlot(kind: DecisionKind, wants: boolean): DecisionSlot {
  const ctx = useContext(DecisionQueueContext);
  const { active, setActive } = ctx ?? FALLBACK;

  useEffect(() => {
    setActive(kind, wants);
    // Leaving the queue on unmount matters: an auction sheet that unmounts
    // mid-countdown must hand the screen to whoever was waiting.
    return () => setActive(kind, false);
  }, [kind, wants, setActive]);

  const { visible, waiting } = pickDecision(active);

  // Without a provider the queue is inert, so honour the caller's own wish.
  if (!ctx) return { visible: wants, waiting: 0 };
  return { visible: visible === kind, waiting };
}
