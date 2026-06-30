import { useEffect, useRef, useState } from "react";
import { Player } from "../../engine/types";

const STEP_MS = 140;
const MAX_WALK_STEPS = 12;
const BOARD_LEN = 40;

/**
 * Drives a "displayed position" per player that walks hop-by-hop toward the
 * authoritative position from the engine. Small forward moves (1–12 tiles)
 * animate; large or backward jumps (Go-to-Jail, Chance teleports) snap.
 */
export function useTokenWalker(players: Player[]): Map<string, number> {
  const [displayed, setDisplayed] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>();
    players.forEach((p) => m.set(p.id, p.position));
    return m;
  });

  const realPositionsRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    players.forEach((p) => {
      realPositionsRef.current.set(p.id, p.position);

      setDisplayed((prev) => {
        if (!prev.has(p.id)) {
          const next = new Map(prev);
          next.set(p.id, p.position);
          return next;
        }
        return prev;
      });
    });

    players.forEach((p) => {
      const startDisplayed = (() => {
        let d = displayed.get(p.id);
        if (d === undefined) d = p.position;
        return d;
      })();

      if (startDisplayed === p.position) return;

      const forwardDist = (p.position - startDisplayed + BOARD_LEN) % BOARD_LEN;
      const shouldWalk = forwardDist >= 1 && forwardDist <= MAX_WALK_STEPS && !p.bankrupt;

      const existing = timersRef.current.get(p.id);
      if (existing) {
        clearInterval(existing);
        timersRef.current.delete(p.id);
      }

      if (!shouldWalk) {
        setDisplayed((prev) => {
          const next = new Map(prev);
          next.set(p.id, p.position);
          return next;
        });
        return;
      }

      const interval = setInterval(() => {
        const target = realPositionsRef.current.get(p.id);
        setDisplayed((prev) => {
          const cur = prev.get(p.id);
          if (cur === undefined || target === undefined || cur === target) {
            clearInterval(interval);
            timersRef.current.delete(p.id);
            return prev;
          }
          const next = new Map(prev);
          next.set(p.id, (cur + 1) % BOARD_LEN);
          return next;
        });
      }, STEP_MS);
      timersRef.current.set(p.id, interval);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map((p) => `${p.id}:${p.position}`).join("|")]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearInterval(t));
      timers.clear();
    };
  }, []);

  return displayed;
}
