import type { ColorGroup, Tile, PropertyTile } from "../../data/board";

/**
 * Board color groups → Nigerian zones, for v2 surfaces.
 *
 * board.ts keeps the legacy group ids ("brown", "lightblue", …) so the old
 * --color-* CSS keeps resolving; the redesign speaks in zones. This is the one
 * place that translation lives. `slug` indexes the v2 zone tokens
 * (--zone-<slug>-bar / -tint / -ink), `code` is the 2-letter board code and
 * `label` is what the deed sheet's zone chip prints.
 */
export interface Zone {
  slug: string;
  code: string;
  label: string;
}

const ZONES: Record<ColorGroup, Zone> = {
  brown: { slug: "borno", code: "BO", label: "BORNO" },
  lightblue: { slug: "kwara", code: "KW", label: "KWARA" },
  pink: { slug: "enugu", code: "EN", label: "ENUGU" },
  orange: { slug: "kaduna", code: "KD", label: "KADUNA" },
  red: { slug: "edo", code: "ED", label: "EDO" },
  yellow: { slug: "rivers", code: "RV", label: "RIVERS" },
  green: { slug: "abuja", code: "AB", label: "ABUJA" },
  darkblue: { slug: "lagos", code: "LA", label: "LAGOS" },
};

export function zoneOfGroup(group: ColorGroup): Zone {
  return ZONES[group];
}

/**
 * The zone chip for any buyable tile. Airports and utilities have no zone, so
 * they get their own neutral chip label and no zone color.
 */
export function tileChip(tile: Tile): { label: string; slug: string | null } {
  if (tile.type === "property") {
    const z = zoneOfGroup((tile as PropertyTile).group);
    return { label: `${z.code} · ${z.label}`, slug: z.slug };
  }
  if (tile.type === "airport") return { label: "AIRPORT", slug: null };
  if (tile.type === "utility") return { label: "UTILITY", slug: null };
  return { label: "", slug: null };
}
