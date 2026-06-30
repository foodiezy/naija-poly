// Token (player piece) definitions — shared by the client UI and the server.
// "Data is data": the token roster lives here, never hardcoded in logic or UI.
// The roster length also caps the number of players a room can hold.

export interface TokenDef {
  id: string;
  emoji: string;
  name: string;
}

export const TOKENS: TokenDef[] = [
  { id: "okada", emoji: "🏍️", name: "Okada" },
  { id: "danfo_bus", emoji: "🚌", name: "Danfo" },
  { id: "agbada", emoji: "🧥", name: "Agbada" },
  { id: "eagle", emoji: "🦅", name: "Eagle" },
  { id: "keke", emoji: "🛺", name: "Keke" },
  { id: "fila", emoji: "🧢", name: "Fila" },
];

export const TOKEN_IDS: string[] = TOKENS.map((t) => t.id);

// Max players per room = number of distinct tokens available.
export const MAX_PLAYERS = TOKENS.length;

// Emoji for a token id, with a neutral fallback for unknown/empty ids.
export function tokenEmoji(tokenId: string | undefined | null): string {
  return TOKENS.find((t) => t.id === tokenId)?.emoji ?? "👤";
}

// Display name for a token id.
export function tokenName(tokenId: string | undefined | null): string {
  return TOKENS.find((t) => t.id === tokenId)?.name ?? "—";
}
