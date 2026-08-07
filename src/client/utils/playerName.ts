// =============================================================================
// client/utils/playerName.ts — persistent player handle via localStorage
//
// The pre-room flow asks for a real name. A previously saved name can prefill
// returning players, but first-time visitors should not be auto-assigned a
// random handle before they have typed anything.
// =============================================================================

const NAME_KEY = "odogwu:name";
const OLD_GENERATED_NAME = /^[A-Z][a-z]+_\d{2}$/;

/** Server-side lobby names are capped; keep the client consistent. */
export const MAX_NAME_LENGTH = 15;

export function savePlayerName(name: string): void {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!clean || OLD_GENERATED_NAME.test(clean)) return;
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    // localStorage unavailable — the in-memory name still works this session
  }
}

/** The stored player name, if the user has entered one before. */
export function loadPlayerName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY)?.trim();
    if (saved && OLD_GENERATED_NAME.test(saved)) {
      localStorage.removeItem(NAME_KEY);
      return "";
    }
    if (saved) return saved.slice(0, MAX_NAME_LENGTH);
  } catch {
    // localStorage unavailable — ask for a name this session
  }
  return "";
}
