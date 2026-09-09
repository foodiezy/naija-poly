import { useEffect, useState } from "react";

/** Mounted only while a room request is pending, so each attempt starts fresh. */
export default function ConnectionStatus() {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLonger(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <p className="v2-join-sub" role="status" aria-live="polite" aria-atomic="true">
      {takingLonger
        ? "Still connecting. The free demo may be waking up, which can take about a minute. Keep this page open."
        : "Connecting to your game. Please keep this page open."}
    </p>
  );
}
