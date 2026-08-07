// =============================================================================
// client/utils/playerName.ts — persistent player handle via localStorage
//
// The v2 pre-room flow never blocks on a name: first visit generates a Naija
// handle (e.g. "Chidi_84"), persists it, and every entry point (landing CTA,
// join gate, quick match) reads the same stored value. Edits via the name
// pill write back here.
// =============================================================================

const NAME_KEY = "odogwu:name";

/** Server-side lobby names are capped; keep the client consistent. */
export const MAX_NAME_LENGTH = 15;

const NAIJA_NAMES = [
  "Chidi",
  "Ada",
  "Emeka",
  "Ngozi",
  "Tunde",
  "Funmi",
  "Bola",
  "Amina",
  "Musa",
  "Yemi",
  "Nkechi",
  "Sade",
];

/** "Chidi_84" — a friendly handle with a 2-digit suffix to dodge collisions. */
export function generateHandle(): string {
  const name = NAIJA_NAMES[Math.floor(Math.random() * NAIJA_NAMES.length)];
  const suffix = 10 + Math.floor(Math.random() * 90);
  return `${name}_${suffix}`;
}

export function savePlayerName(name: string): void {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!clean) return;
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    // localStorage unavailable — the in-memory name still works this session
  }
}

/**
 * The stored handle, or a freshly generated one (persisted immediately so the
 * same identity greets the player next visit).
 */
export function loadPlayerName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY)?.trim();
    if (saved) return saved.slice(0, MAX_NAME_LENGTH);
  } catch {
    // fall through to a generated handle
  }
  const generated = generateHandle();
  savePlayerName(generated);
  return generated;
}
