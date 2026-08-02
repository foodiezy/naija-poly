/**
 * Design-system gate: no raw colours in client components.
 *
 * The redesign moved every colour into src/client/tokens.css so the theme is
 * changeable from one place. That only holds if nothing sneaks a literal back
 * in — and literals are exactly what crept in last time, one inline style at a
 * time, until the game view was unthemeable.
 *
 * Fails on a hex or rgb()/rgba() literal in src/client/**\/*.tsx, with three
 * deliberate exemptions:
 *   - a literal inside a var() fallback, e.g. var(--ink, #101828). The error
 *     boundary needs those: it can render when the stylesheet never loaded.
 *   - icons.tsx and decor.tsx, which are SVG artwork. A green house is drawn
 *     green; that is illustration, not theming.
 *   - DevPanel.tsx, which is tree-shaken out of production builds.
 *
 * CSS is not checked here: tokens.css is where literals are supposed to live,
 * and index.css still holds legacy rules being converted step by step.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src", "client");

const EXEMPT_FILES = new Set(["icons.tsx", "decor.tsx", "DevPanel.tsx"]);

// A hex colour, or an rgb()/rgba() call.
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d+[\s,]/g;
// Everything inside a var(...) fallback is allowed; blank those out first so a
// legitimate fallback can't trip the scan.
const VAR_FALLBACK = /var\(\s*--[a-z0-9-]+\s*,[^)]*\)/gi;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const offences = [];
for (const file of walk(SRC)) {
  if (EXEMPT_FILES.has(file.split(sep).pop())) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const stripped = line.replace(VAR_FALLBACK, "var(--x)");
    const hits = stripped.match(COLOR);
    if (hits) {
      offences.push(`${relative(ROOT, file)}:${i + 1}  ${hits.join(", ")}\n    ${line.trim()}`);
    }
  });
}

if (offences.length) {
  console.error(`\n✖ ${offences.length} raw colour(s) in client components.\n`);
  console.error(offences.join("\n\n"));
  console.error(
    `\nUse a token from src/client/tokens.css instead, e.g. var(--pri), var(--ink),
var(--zone-<slug>-bar). If the value is genuinely artwork rather than theme,
add the file to EXEMPT_FILES in scripts/check-inline-colors.mjs and say why.\n`,
  );
  process.exit(1);
}

console.log("✓ no raw colours in client components");
