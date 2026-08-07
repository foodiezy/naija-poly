import { useState } from "react";
import { MAX_NAME_LENGTH } from "../utils/playerName";

interface NamePillProps {
  name: string;
  onChange: (name: string) => void;
  /**
   * "sm" — landing: compact "Playing as **Chidi_84** ✎" pill.
   * "lg" — join gate: full-width row with a "change ✎" hint (mockup screen 2).
   */
  variant: "sm" | "lg";
}

/**
 * The editable identity pill. At rest it's a button (so the page never boots
 * with a focused text input — Android keyboards must not cover the CTA);
 * tapping it swaps in an inline input, committed on Enter or blur. An empty
 * edit reverts to the previous name — the name can never block a CTA.
 */
export default function NamePill({ name, onChange, variant }: NamePillProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const clean = draft.trim().slice(0, MAX_NAME_LENGTH);
    if (clean && clean !== name) onChange(clean);
  };

  if (editing) {
    return (
      <input
        className={variant === "lg" ? "v2-pill-input v2-pill-input-lg" : "v2-pill-input"}
        value={draft}
        maxLength={MAX_NAME_LENGTH}
        // autoFocus is user-initiated here (they just tapped "edit"), not a
        // page-load focus — the never-autofocus rule applies to mount time.
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Your player name"
      />
    );
  }

  if (variant === "lg") {
    return (
      <button type="button" className="v2-pill-lg" onClick={startEdit}>
        {name}
        <span>change ✎</span>
      </button>
    );
  }

  return (
    <button type="button" className="v2-pill" onClick={startEdit}>
      Playing as <b>{name}</b>
      <span aria-hidden="true">✎</span>
    </button>
  );
}
