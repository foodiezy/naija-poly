import { useState } from "react";

// Dev-only playtesting panel. The whole component is behind `import.meta.env.DEV`
// at its mount site, so it is tree-shaken out of production builds entirely; the
// matching server command is also inert unless ENABLE_DEV_TOOLS=true is set.
interface Props {
  status: "lobby" | "in_progress" | "finished" | string;
  onStartChaosGame: () => void;
  onForceChaos: (cardId: string) => void;
}

// Card ids map to the redesigned chaos mechanics (see board.ts CHAOS_CHANCE_CARDS).
const FORCE_BUTTONS: { label: string; cardId: string; hint: string }[] = [
  { label: "C1 · NEPA blackout", cardId: "cx01", hint: "aim a zone dark (+ generator buyout = C2)" },
  { label: "C3 · Fuel stockpile", cardId: "cx03", hint: "take now vs double next round" },
  { label: "C4 · Fire sale", cardId: "cx04", hint: "buy a tile at a discount" },
  { label: "C5 · EFCC settlement", cardId: "cx05", hint: "richest pays or surrenders" },
];

export default function DevPanel({ status, onStartChaosGame, onForceChaos }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        zIndex: 9999,
        background: "rgba(20,20,20,0.92)",
        border: "1px solid #f59e0b",
        borderRadius: 4,
        padding: open ? "0.5rem 0.6rem" : "0.25rem 0.5rem",
        fontSize: "0.7rem",
        color: "#fde68a",
        maxWidth: 220,
        fontFamily: "monospace",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <strong>🧪 DEV</strong>
        <span style={{ opacity: 0.7 }}>{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {status === "lobby" && (
            <button
              onClick={onStartChaosGame}
              style={{ padding: "0.35rem", borderRadius: 3, cursor: "pointer" }}
            >
              ▶ Start local chaos game
            </button>
          )}

          {status === "in_progress" && (
            <>
              <div style={{ opacity: 0.75 }}>Force next Chance card:</div>
              {FORCE_BUTTONS.map((b) => (
                <button
                  key={b.cardId}
                  onClick={() => onForceChaos(b.cardId)}
                  title={b.hint}
                  style={{ padding: "0.3rem", borderRadius: 3, cursor: "pointer", textAlign: "left" }}
                >
                  {b.label}
                </button>
              ))}
              <div style={{ opacity: 0.6, marginTop: "0.2rem", lineHeight: 1.3 }}>
                Then land on a Chance tile (7 / 22 / 36) to draw it.
              </div>
            </>
          )}

          {status === "finished" && <div style={{ opacity: 0.7 }}>Game over.</div>}
        </div>
      )}
    </div>
  );
}
