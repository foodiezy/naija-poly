import { useEffect, useState } from "react";
import { ALL_TRIVIA } from "../../data/facts";

// Cycles through the shared trivia pool from a random starting point, useful
// for idle moments (lobby waiting room, other players' turns).
export function useTriviaRotation(intervalMs: number, paused = false): string {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * ALL_TRIVIA.length));

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % ALL_TRIVIA.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, paused]);

  return ALL_TRIVIA[index];
}
