/**
 * Chat profanity filter. Data (the word list) lives here per the project rule;
 * the server censors chat text before broadcasting, so no client ever receives
 * the raw word and it cannot be bypassed from the client.
 *
 * Matching is WHOLE-WORD (word boundaries) on a leetspeak-normalised copy of
 * the text — so "sh1t" and "$hit" are caught — with a small curated suffix
 * group so inflections like "bitches" / "fucking" match. Whole-word matching
 * sidesteps the classic "Scunthorpe problem" of blanking innocent substrings
 * (class, assist, grass, Dickson, …). Matches become asterisks of the same
 * length, so "shit" → "****".
 *
 * To retheme/extend the filter, edit BAD_WORDS — nothing else needs to change.
 */

const BAD_WORDS = [
  "fuck",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "asshole",
  "ass",
  "arse",
  "bastard",
  "dick",
  "dickhead",
  "piss",
  "cunt",
  "crap",
  "prick",
  "slut",
  "whore",
  "douche",
  "wanker",
  "bollocks",
  "twat",
  "cock",
  "pussy",
  "jackass",
  "dumbass",
  "fag",
  "faggot",
  "nigger",
  "nigga",
  "retard",
];

// 1:1 symbol → letter map ONLY (no repeat-collapsing), so the normalised copy
// stays the same length as the original and match indices line up exactly.
const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "0": "o",
  "5": "s",
  $: "s",
  "7": "t",
};

// Common inflections we still want to catch (kept tight to avoid false hits).
const SUFFIX = "(?:s|es|ed|er|ers|ing|in|y|ies|hole|holes|face|z)?";

const PATTERN = new RegExp(`\\b(?:${BAD_WORDS.join("|")})${SUFFIX}\\b`, "gi");

function normaliseLeet(text: string): string {
  return text.replace(/[@43105!$7]/g, (c) => LEET[c] ?? c);
}

/** Replace any profanity in `text` with same-length asterisks. */
export function censorProfanity(text: string): string {
  const norm = normaliseLeet(text);
  const ranges: Array<[number, number]> = [];
  PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATTERN.exec(norm)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
    // Zero-length safety (can't happen with these patterns, but be defensive).
    if (match.index === PATTERN.lastIndex) PATTERN.lastIndex++;
  }
  if (ranges.length === 0) return text;

  const chars = text.split("");
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) chars[i] = "*";
  }
  return chars.join("");
}
