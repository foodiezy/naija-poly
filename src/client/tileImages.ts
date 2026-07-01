// =============================================================================
// tileImages.ts — real photo URLs for board tiles (CLIENT-ONLY presentation)
// -----------------------------------------------------------------------------
// Keyed by board position (0–39). Photos are permanent Wikimedia Commons CDN
// URLs (upload.wikimedia.org) of the real Nigerian city/landmark so players can
// see where they are actually buying. Minor towns reuse their zone's landmark
// photo; utilities and special tiles have no photo and fall back to a themed
// emoji + gradient (see <TileImage>).
//
// This is NOT engine data — it never touches money/rules — so it lives in the
// client, not src/data/board.ts.
// =============================================================================

import { PropertyTile, Tile } from "../data/board";


// Reused zone landmarks (a few towns share their region's photo).
const MAIDUGURI = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Indimi_Mosque_Maiduguri_Borno_State_Nigeria.jpg/330px-Indimi_Mosque_Maiduguri_Borno_State_Nigeria.jpg";
const ILORIN = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Sobi_hills%2C_Kwara_State%2C_Nigeria._01.jpg/330px-Sobi_hills%2C_Kwara_State%2C_Nigeria._01.jpg";
const ENUGU = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Climate_and_weather_in_Nigeria_11.jpg/330px-Climate_and_weather_in_Nigeria_11.jpg";
const KADUNA = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Lugard_Hall%2C_Kaduna._Parliamentary_house_of_assembly_Capital_of_North_Region.jpg/330px-Lugard_Hall%2C_Kaduna._Parliamentary_house_of_assembly_Capital_of_North_Region.jpg";
const PORT_HARCOURT = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Pitakwa.jpg/330px-Pitakwa.jpg";
const ABUJA = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Abuja_heritages_30.jpg/330px-Abuja_heritages_30.jpg";
const LAGOS_SKYLINE = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Ikoyi_and_Beyond.jpg/330px-Ikoyi_and_Beyond.jpg";

export const TILE_IMAGES: Record<number, string> = {
  // ── Borno ──────────────────────────────────────────────────────────────
  1: MAIDUGURI, // Maiduguri
  3: MAIDUGURI, // Bama (zone photo)

  // Airport (Lagos)
  5: LAGOS_SKYLINE, // Murtala Muhammed Airport

  // ── Kwara ──────────────────────────────────────────────────────────────
  6: ILORIN, // Ilorin
  8: ILORIN, // Sango (zone photo)
  9: ILORIN, // Tanke (zone photo)

  // ── Enugu ──────────────────────────────────────────────────────────────
  11: ENUGU, // Enugu
  12: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/River_Niger_at_Kainji_Dam_Niger_State.jpg/330px-River_Niger_at_Kainji_Dam_Niger_State.jpg", // NEPA (utility)
  13: ENUGU, // Udi (zone photo)
  14: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Ariel_view_of_Nsukka_from_the_mountains.jpg/330px-Ariel_view_of_Nsukka_from_the_mountains.jpg", // Nsukka

  // Airport (Abuja)
  15: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/NAIA_Abuja_Terminal_Entrance.jpg/330px-NAIA_Abuja_Terminal_Entrance.jpg", // Nnamdi Azikiwe Airport

  // ── Kaduna ─────────────────────────────────────────────────────────────
  16: KADUNA, // Kaduna
  18: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Zazzau_Emirs_Palace_Gate.jpg/330px-Zazzau_Emirs_Palace_Gate.jpg", // Zaria
  19: KADUNA, // Kafanchan (zone photo)

  // ── Edo ────────────────────────────────────────────────────────────────
  21: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Nat_Museum%2C_Benin.jpg/330px-Nat_Museum%2C_Benin.jpg", // Benin City
  23: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Auchi.jpg/330px-Auchi.jpg", // Auchi
  24: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Ekpoma.jpg/330px-Ekpoma.jpg", // Ekpoma

  // Airport (Port Harcourt)
  25: PORT_HARCOURT, // Port Harcourt Airport

  // ── Rivers ─────────────────────────────────────────────────────────────
  26: PORT_HARCOURT, // Port Harcourt
  27: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Bonny_City_-_panoramio.jpg/330px-Bonny_City_-_panoramio.jpg", // Bonny Island
  28: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/NAFDAC_emblem.svg/330px-NAFDAC_emblem.svg.png", // NAFDAC (utility)
  29: PORT_HARCOURT, // Oyigbo (zone photo)

  // ── Abuja ──────────────────────────────────────────────────────────────
  31: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/A_view_of_the_Nigerian_Communications_Commission_headquarters_building.jpg/330px-A_view_of_the_Nigerian_Communications_Commission_headquarters_building.jpg", // Maitama
  32: ABUJA, // Asokoro (zone photo)
  34: ABUJA, // Wuse (zone photo)

  // Airport (Kano)
  35: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Aminu_Kano_International_Airport_Kano.jpg/330px-Aminu_Kano_International_Airport_Kano.jpg", // Mallam Aminu Kano Airport

  // ── Lagos ──────────────────────────────────────────────────────────────
  37: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Civic_Center%2C_Victoria_island._Lagos.jpg/330px-Civic_Center%2C_Victoria_island._Lagos.jpg", // Victoria Island
  39: LAGOS_SKYLINE, // Ikoyi
};

// ----------------------------------------------------------------------------
// Themed fallback (used when a tile has no photo or the photo fails to load).
// ----------------------------------------------------------------------------

const GROUP_COLORS: Record<string, string> = {
  brown: "var(--color-brown)",
  lightblue: "var(--color-lightblue)",
  pink: "var(--color-pink)",
  orange: "var(--color-orange)",
  red: "var(--color-red)",
  yellow: "var(--color-yellow)",
  green: "var(--color-green)",
  darkblue: "var(--color-darkblue)",
};

export function tileFallbackEmoji(tile: Tile): string {
  switch (tile.type) {
    case "airport": return "✈️";
    case "utility":
      return tile.name.toLowerCase().includes("nepa") ? "⚡" : "🧪";
    case "property": return "🏙️";
    case "go": return "🚀";
    case "jail": return "🔒";
    case "free": return "🍲";
    case "gotojail": return "👮";
    case "chance": return "❓";
    case "hustle": return "💼";
    case "tax": return "💰";
    default: return "📍";
  }
}

export function tileFallbackGradient(tile: Tile): string {
  if (tile.type === "property") {
    const c = GROUP_COLORS[(tile as PropertyTile).group] || "#334155";
    return `linear-gradient(135deg, ${c} 0%, rgba(8,12,24,0.9) 130%)`;
  }
  if (tile.type === "airport") return "linear-gradient(135deg, #1e3a5f 0%, #0a0f1e 100%)";
  if (tile.type === "utility") return "linear-gradient(135deg, #4b5563 0%, #0a0f1e 100%)";
  return "linear-gradient(135deg, #1f2937 0%, #0a0f1e 100%)";
}

export const tileImageUrl = (pos: number): string | undefined => TILE_IMAGES[pos];
